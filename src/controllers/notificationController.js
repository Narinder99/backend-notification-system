const notificationService = require('../services/notificationService');
const sseService = require('../services/sseService');
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class NotificationController {
  // SSE endpoint for real-time notifications
  async connectSSE(req, res) {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Update user status to online
    await notificationService.updateUserStatus(userId, true);
    
    // Add client to SSE service
    sseService.addClient(userId, res);
  }

  // Get all notifications for a user
  async getNotifications(req, res) {
    try {
      const { userId } = req.params;
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      const notifications = await notificationService.getNotifications(userId);
      
      res.json({
        success: true,
        data: notifications
      });
    } catch (error) {
      console.error('Error getting notifications:', error);
      res.status(500).json({ error: 'Failed to get notifications' });
    }
  }

  // Mark notification as seen
  async markAsSeen(req, res) {
    try {
      const { userId, notificationId } = req.params;
      
      if (!userId || !notificationId) {
        return res.status(400).json({ error: 'User ID and notification ID are required' });
      }

      await notificationService.markAsSeen(userId, notificationId);
      
      res.json({
        success: true,
        message: 'Notification marked as seen'
      });
    } catch (error) {
      console.error('Error marking notification as seen:', error);
      res.status(500).json({ error: 'Failed to mark notification as seen' });
    }
  }

  // Clear all notifications for a user
  async clearNotifications(req, res) {
    try {
      const { userId } = req.params;
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      await notificationService.clearNotifications(userId);
      
      res.json({
        success: true,
        message: 'All notifications cleared successfully'
      });
    } catch (error) {
      console.error('Error clearing notifications:', error);
      res.status(500).json({ error: 'Failed to clear notifications' });
    }
  }

  // Create a new notification (triggered by user actions)
  async createNotification(req, res) {
    try {
      const { actorId, type, message, targetUserId } = req.body;
      
      if (!actorId || !type || !message) {
        return res.status(400).json({ error: 'Actor ID, type, and message are required' });
      }

      await notificationService.createNotification(actorId, type, message, targetUserId);
      
      res.json({
        success: true,
        message: 'Notification created successfully'
      });
    } catch (error) {
      console.error('Error creating notification:', error);
      res.status(500).json({ error: 'Failed to create notification', details: error.message });
    }
  }

  // Create a one-to-one notification (for like, comment, follow)
  async createOneToOneNotification(req, res) {
    try {
      const { actorId, targetUserId, type, message } = req.body;
      
      if (!actorId || !targetUserId || !type || !message) {
        return res.status(400).json({ error: 'Actor ID, target user ID, type, and message are required' });
      }

      await notificationService.createOneToOneNotification(actorId, targetUserId, type, message);
      
      res.json({
        success: true,
        message: 'One-to-one notification created successfully'
      });
    } catch (error) {
      console.error('Error creating one-to-one notification:', error);
      res.status(500).json({ error: 'Failed to create one-to-one notification', details: error.message });
    }
  }

  // Follow a user
  async followUser(req, res) {
    try {
      const { followerId, userId } = req.body;
      
      if (!followerId || !userId) {
        return res.status(400).json({ error: 'Follower ID and user ID are required' });
      }

      await notificationService.followUser(followerId, userId);
      
      res.json({
        success: true,
        message: 'User followed successfully'
      });
    } catch (error) {
      console.error('Error following user:', error);
      res.status(500).json({ error: 'Failed to follow user' });
    }
  }

  // Unfollow a user
  async unfollowUser(req, res) {
    try {
      const { followerId, userId } = req.body;
      
      if (!followerId || !userId) {
        return res.status(400).json({ error: 'Follower ID and user ID are required' });
      }

      await notificationService.unfollowUser(followerId, userId);
      
      res.json({
        success: true,
        message: 'User unfollowed successfully'
      });
    } catch (error) {
      console.error('Error unfollowing user:', error);
      res.status(500).json({ error: 'Failed to unfollow user' });
    }
  }

  // Update user online status
  async updateUserStatus(req, res) {
    try {
      const { userId } = req.params;
      const { isOnline } = req.body;
      
      if (!userId || typeof isOnline !== 'boolean') {
        return res.status(400).json({ error: 'User ID and online status are required' });
      }

      await notificationService.updateUserStatus(userId, isOnline);
      
      res.json({
        success: true,
        message: 'User status updated successfully'
      });
    } catch (error) {
      console.error('Error updating user status:', error);
      res.status(500).json({ error: 'Failed to update user status' });
    }
  }

  // Get user info
  async getUser(req, res) {
    try {
      const { userId } = req.params;
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      const result = await pool.query(
        'SELECT id, username, is_online, follower_count FROM users WHERE id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      console.error('Error getting user:', error);
      res.status(500).json({ error: 'Failed to get user' });
    }
  }

  // Create a new user
  async createUser(req, res) {
    try {
      const { username } = req.body;
      
      if (!username) {
        return res.status(400).json({ error: 'Username is required' });
      }

      const userId = uuidv4();
      
      await pool.query(
        'INSERT INTO users (id, username) VALUES ($1, $2)',
        [userId, username]
      );

      res.json({
        success: true,
        data: { id: userId, username }
      });
    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  }

  // Get all users (for demo purposes)
  async getUsers(req, res) {
    try {
      const result = await pool.query(
        'SELECT id, username, is_online, follower_count FROM users ORDER BY username'
      );

      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('Error getting users:', error);
      res.status(500).json({ error: 'Failed to get users' });
    }
  }

  // Get SSE connection count (for monitoring)
  async getConnectionCount(req, res) {
    try {
      const count = sseService.getConnectedCount();
      
      res.json({
        success: true,
        data: { connectedClients: count }
      });
    } catch (error) {
      console.error('Error getting connection count:', error);
      res.status(500).json({ error: 'Failed to get connection count' });
    }
  }
}

module.exports = new NotificationController(); 