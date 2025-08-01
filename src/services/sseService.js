class SSEService {
  constructor() {
    this.clients = new Map(); // Map of userId -> response object
  }

  // Add a new client connection
  addClient(userId, res) {
    // Set headers for SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'SSE connection established' })}\n\n`);

    // Store the client
    this.clients.set(userId, res);

    // Handle client disconnect
    res.on('close', () => {
      this.clients.delete(userId);
      console.log(`Client ${userId} disconnected`);
    });

    res.on('error', (err) => {
      console.error(`SSE Error for user ${userId}:`, err);
      this.clients.delete(userId);
    });
  }

  // Send notification to a specific user
  sendToUser(userId, notification) {
    const client = this.clients.get(userId);
    if (client) {
      try {
        client.write(`data: ${JSON.stringify(notification)}\n\n`);
      } catch (error) {
        console.error(`Error sending to user ${userId}:`, error);
        this.clients.delete(userId);
      }
    }
  }

  // Send notification to multiple users
  sendToUsers(userIds, notification) {
    userIds.forEach(userId => {
      this.sendToUser(userId, notification);
    });
  }

  // Broadcast to all connected clients
  broadcast(notification) {
    this.clients.forEach((client, userId) => {
      this.sendToUser(userId, notification);
    });
  }

  // Get number of connected clients
  getConnectedCount() {
    return this.clients.size;
  }

  // Check if user is connected
  isUserConnected(userId) {
    return this.clients.has(userId);
  }
}

module.exports = new SSEService(); 