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
      const notification = {
        id: notificationId,
        type,
        message: `${actorUsername} ${message}`,
        seen: false,
        actor_id: actorId,
        created_at: new Date()
      };

      console.log('Created one-to-one notification:', notification);

      // Add notification to target user's array
      await this.addNotificationToUser(client, targetUserId, notification);

      // Send via SSE to target user if they're online
      const targetUserStatus = await client.query(
        'SELECT is_online FROM users WHERE id = $1',
        [targetUserId]
      );

      if (targetUserStatus.rows[0]?.is_online) {
        sseService.sendToUsers([targetUserId], {
          type: 'notification',
          data: notification
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

      // Add notification to each follower's array (max 100)
      for (const followerId of onlineFollowerIds) {
        await this.addNotificationToUser(client, followerId, notification);
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



  // Add notification to user's array (with cleanup for max 100)
  async addNotificationToUser(client, userId, notification) {
    // Get current notifications
    const result = await client.query(
      'SELECT notifications FROM users WHERE id = $1',
      [userId]
    );

    // Parse JSON notifications
    let notifications = [];
    if (result.rows[0]?.notifications) {
      try {
        notifications = Array.isArray(result.rows[0].notifications) 
          ? result.rows[0].notifications 
          : JSON.parse(result.rows[0].notifications);
      } catch (error) {
        console.error('Error parsing notifications JSON:', error);
        notifications = [];
      }
    }
    
    // Add new notification
    notifications.push(notification);
    
    // Keep only the latest 100 notifications
    if (notifications.length > 100) {
      notifications = notifications.slice(-100);
    }

    // Store notifications as JSON for simplicity
    await client.query(
      'UPDATE users SET notifications = $1 WHERE id = $2',
      [JSON.stringify(notifications), userId]
    );
  }

  // Get notifications for a user
  async getNotifications(userId) {
    const client = await pool.connect();
    try {
      // Get direct notifications only
      const directResult = await client.query(
        'SELECT notifications FROM users WHERE id = $1',
        [userId]
      );

      if (directResult.rows.length === 0) {
        throw new Error('User not found');
      }

      // Parse JSON notifications
      let directNotifications = [];
      if (directResult.rows[0]?.notifications) {
        try {
          directNotifications = Array.isArray(directResult.rows[0].notifications) 
            ? directResult.rows[0].notifications 
            : JSON.parse(directResult.rows[0].notifications);
        } catch (error) {
          console.error('Error parsing notifications JSON:', error);
          directNotifications = [];
        }
      }
      
      // Sort by timestamp (newest first)
      return directNotifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    } finally {
      client.release();
    }
  }

  // Mark notification as seen
  async markAsSeen(userId, notificationId) {
    const client = await pool.connect();
    try {
      // Update direct notifications
      const result = await client.query(
        'SELECT notifications FROM users WHERE id = $1',
        [userId]
      );

      if (result.rows.length === 0) return;

      // Parse JSON notifications
      let notifications = [];
      if (result.rows[0].notifications) {
        try {
          notifications = Array.isArray(result.rows[0].notifications) 
            ? result.rows[0].notifications 
            : JSON.parse(result.rows[0].notifications);
        } catch (error) {
          console.error('Error parsing notifications JSON:', error);
          notifications = [];
        }
      }
      
      const updatedNotifications = notifications.map(notification => {
        if (notification.id === notificationId) {
          return { ...notification, seen: true };
        }
        return notification;
      });

      // Update user's notifications as JSON
      await client.query(
        'UPDATE users SET notifications = $1 WHERE id = $2',
        [JSON.stringify(updatedNotifications), userId]
      );

    } finally {
      client.release();
    }
  }

  // Clear all notifications for a user
  async clearNotifications(userId) {
    const client = await pool.connect();
    try {
      // Clear all notifications by setting to empty array
      await client.query(
        'UPDATE users SET notifications = $1 WHERE id = $2',
        [JSON.stringify([]), userId]
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
        await this.addNotificationToUser(client, userId, notification);

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