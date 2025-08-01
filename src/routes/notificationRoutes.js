const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');

// SSE endpoint for real-time notifications
router.get('/sse/:userId', notificationController.connectSSE);

// Notification endpoints
router.get('/notifications/:userId', notificationController.getNotifications);
router.put('/notifications/:userId/:notificationId/seen', notificationController.markAsSeen);
router.post('/notifications', notificationController.createNotification);
router.post('/notifications/one-to-one', notificationController.createOneToOneNotification);
router.delete('/notifications/:userId', notificationController.clearNotifications);

// User management endpoints
router.get('/users', notificationController.getUsers);
router.get('/users/:userId', notificationController.getUser);
router.post('/users', notificationController.createUser);
router.put('/users/:userId/status', notificationController.updateUserStatus);

// Follow/unfollow endpoints
router.post('/follow', notificationController.followUser);
router.post('/unfollow', notificationController.unfollowUser);

// Monitoring endpoint
router.get('/connections', notificationController.getConnectionCount);

module.exports = router; 