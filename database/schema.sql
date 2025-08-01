-- Create users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    is_online BOOLEAN DEFAULT FALSE,
    follower_count INTEGER DEFAULT 0,
    last_event_checked TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create user_followers table
CREATE TABLE user_followers ( 
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,  -- The person being followed 
    follower_id UUID REFERENCES users(id) ON DELETE CASCADE,  -- The person doing the following
    created_at TIMESTAMP DEFAULT NOW(), 
    UNIQUE(user_id, follower_id)  -- Prevents duplicate follows 
);

-- Create notification_events table
CREATE TABLE notification_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, 
    message TEXT,
    seen BOOLEAN DEFAULT FALSE,
    actor_id UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX idx_user_followers_user_id ON user_followers(user_id);
CREATE INDEX idx_user_followers_follower_id ON user_followers(follower_id);
CREATE INDEX idx_notification_events_user_id ON notification_events(user_id);
CREATE INDEX idx_notification_events_created_at ON notification_events(created_at);
CREATE INDEX idx_notification_events_seen ON notification_events(seen); 