const pool = require('../config/database');
const sseService = require('./sseService');
const { v4: uuidv4 } = require('uuid');

class NotificationService {
  // Create a new notification
  async createNotification(actorId, type, message, targetUserId = null) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get actor's follower count
      const actorResult = await client.query(
        'SELECT follower_count FROM users WHERE id = $1',
        [actorId]
      );

      if (actorResult.rows.length === 0) {
        throw new Error('Actor not found');
      }

      // Always use direct fan-out (no event-based processing)
      await this.directFanOut(client, actorId, type, message);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creating notification:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Create a one-to-one notification (for like, comment, follow)
  async createOneToOneNotification(actorId, targetUserId, type, message) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get actor's username
      const actorUser = await client.query(
        'SELECT username FROM users WHERE id = $1',
        [actorId]
      );

      if (actorUser.rows.length === 0) {
        throw new Error('Actor not found');
      }

      const actorUsername = actorUser.rows[0]?.username || 'Unknown User';

      // Create notification for the target user only
      const notificationId = uuidv4();
      const notificationMessage = `${actorUsername} ${message}`;

      console.log('Created one-to-one notification:', { id: notificationId, type, message: notificationMessage });

      // Insert notification into notification_events table
      await client.query(
        'INSERT INTO notification_events (id, user_id, type, message, seen, actor_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [notificationId, targetUserId, type, notificationMessage, false, actorId, new Date()]
      );

      // Send via SSE to target user if they're online
      const targetUserStatus = await client.query(
        'SELECT is_online FROM users WHERE id = $1',
        [targetUserId]
      );

      if (targetUserStatus.rows[0]?.is_online) {
        sseService.sendToUsers([targetUserId], {
          type: 'notification',
          data: {
            id: notificationId,
            type,
            message: notificationMessage,
            seen: false,
            actor_id: actorId,
            created_at: new Date()
          }
        });
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creating one-to-one notification:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Direct fan-out process (≤10K followers)
  async directFanOut(client, actorId, type, message) {
    try {
      // Get online followers of the user
      const followersResult = await client.query(`
        SELECT uf.follower_id 
        FROM user_followers uf 
        JOIN users u ON uf.follower_id = u.id 
        WHERE uf.user_id = $1 AND u.is_online = true
      `, [actorId]);

      const onlineFollowerIds = followersResult.rows.map(row => row.follower_id);
      
      console.log('Online followers found:', onlineFollowerIds);
      
      if (onlineFollowerIds.length === 0) {
        console.log('No online followers found');
        return;
      }

      // Get actor's username
      const actorUser = await client.query(
        'SELECT username FROM users WHERE id = $1',
        [actorId]
      );

      const actorUsername = actorUser.rows[0]?.username || 'Unknown User';

      // Create notification for each online follower
      const notificationId = uuidv4();
      const notification = {
        id: notificationId,
        type,
        message: `${actorUsername} ${message}`,
        seen: false,
        actor_id: actorId,
        created_at: new Date()
      };

      console.log('Created notification:', notification);

      // Add notification to each follower's notification_events table
      for (const followerId of onlineFollowerIds) {
        const notificationId = uuidv4();
        await client.query(
          'INSERT INTO notification_events (id, user_id, type, message, seen, actor_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [notificationId, followerId, notification.type, notification.message, false, actorId, new Date()]
        );
      }

      // Send via SSE to connected users immediately
      sseService.sendToUsers(onlineFollowerIds, {
        type: 'notification',
        data: notification
      });
    } catch (error) {
      console.error('Error in directFanOut:', error);
      throw error;
    }
  }





  // Get notifications for a user
  async getNotifications(userId) {
    const client = await pool.connect();
    try {
      // Get notifications from notification_events table
      const result = await client.query(`
        SELECT ne.id, ne.type, ne.message, ne.seen, ne.actor_id, ne.created_at, u.username as actor_username
        FROM notification_events ne
        LEFT JOIN users u ON ne.actor_id = u.id
        WHERE ne.user_id = $1
        ORDER BY ne.created_at DESC
      `, [userId]);

      return result.rows;

    } finally {
      client.release();
    }
  }

  // Mark notification as seen
  async markAsSeen(userId, notificationId) {
    const client = await pool.connect();
    try {
      // Update notification in notification_events table
      await client.query(
        'UPDATE notification_events SET seen = true WHERE id = $1 AND user_id = $2',
        [notificationId, userId]
      );

    } finally {
      client.release();
    }
  }

  // Clear all notifications for a user
  async clearNotifications(userId) {
    const client = await pool.connect();
    try {
      // Clear all notifications from notification_events table
      await client.query(
        'DELETE FROM notification_events WHERE user_id = $1',
        [userId]
      );

      console.log(`Cleared all notifications for user ${userId}`);
    } finally {
      client.release();
    }
  }

  // Update user online status
  async updateUserStatus(userId, isOnline) {
    await pool.query(
      'UPDATE users SET is_online = $1 WHERE id = $2',
      [isOnline, userId]
    );
  }

  // Follow a user
  async followUser(followerId, userId) {
    // Prevent self-following
    if (followerId === userId) {
      throw new Error('Users cannot follow themselves');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Add follow relationship
      await client.query(`
        INSERT INTO user_followers (id, user_id, follower_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, follower_id) DO NOTHING
      `, [uuidv4(), userId, followerId]);

      // Update follower count
      await client.query(`
        UPDATE users 
        SET follower_count = (
          SELECT COUNT(*) FROM user_followers WHERE user_id = $1
        )
        WHERE id = $1
      `, [userId]);

      // Create notification for the person being followed
      const followerUser = await client.query(
        'SELECT username FROM users WHERE id = $1',
        [followerId]
      );

      const followedUser = await client.query(
        'SELECT username FROM users WHERE id = $1',
        [userId]
      );

      if (followerUser.rows.length > 0 && followedUser.rows.length > 0) {
        const notificationId = uuidv4();
        const notification = {
          id: notificationId,
          type: 'follow',
          message: `${followerUser.rows[0].username} followed you`,
          seen: false,
          actor_id: followerId,
          created_at: new Date()
        };

        // Add notification to the person being followed (userId is the person being followed)
        await client.query(
          'INSERT INTO notification_events (id, user_id, type, message, seen, actor_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [notificationId, userId, 'follow', `${followerUser.rows[0].username} followed you`, false, followerId, new Date()]
        );

        // Send via SSE to the person being followed if they're online
        const followedUserStatus = await client.query(
          'SELECT is_online FROM users WHERE id = $1',
          [userId]
        );

        if (followedUserStatus.rows[0]?.is_online) {
          sseService.sendToUsers([userId], {
            type: 'notification',
            data: notification
          });
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Unfollow a user
  async unfollowUser(followerId, userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Remove follow relationship
      await client.query(`
        DELETE FROM user_followers 
        WHERE user_id = $1 AND follower_id = $2
      `, [userId, followerId]);

      // Update follower count
      await client.query(`
        UPDATE users 
        SET follower_count = (
          SELECT COUNT(*) FROM user_followers WHERE user_id = $1
        )
        WHERE id = $1
      `, [userId]);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = new NotificationService(); 