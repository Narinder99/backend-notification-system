-- Custom notification storage
CREATE TYPE notification_item AS (
    id UUID, 
    type VARCHAR(50), 
    message TEXT,
    seen boolean default false, 
    actor_id UUID, --notification send by whome
    created_at TIMESTAMP
);

CREATE TABLE users (
    id UUID PRIMARY KEY,
    username VARCHAR(50),
    is_online BOOLEAN DEFAULT FALSE,
    follower_count INTEGER DEFAULT 0,
    notifications notification_item[] DEFAULT '{}',
    last_event_checked TIMESTAMP DEFAULT NOW()
);

CREATE TABLE user_followers ( 
    id UUID PRIMARY KEY, 
    user_id UUID REFERENCES users(id),  -- The person being followed 
    follower_id UUID REFERENCES users(id),  -- The person doing the following
    created_at TIMESTAMP DEFAULT NOW(), 
    UNIQUE(user_id, follower_id)  -- Prevents duplicate follows 
);

CREATE TABLE notification_events (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    type VARCHAR(50), 
    message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX idx_user_followers_user_id ON user_followers(user_id);
CREATE INDEX idx_user_followers_follower_id ON user_followers(follower_id);
CREATE INDEX idx_notification_events_user_id ON notification_events(user_id);
CREATE INDEX idx_notification_events_created_at ON notification_events(created_at); 