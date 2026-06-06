-- Per-service databases (single cluster, isolated schemas by DB)
CREATE DATABASE auth_db;
CREATE DATABASE user_db;
CREATE DATABASE contact_db;
CREATE DATABASE chat_db;
CREATE DATABASE media_db;
CREATE DATABASE story_db;
CREATE DATABASE emoji_db;
CREATE DATABASE notification_db;

GRANT ALL PRIVILEGES ON DATABASE auth_db TO securechat;
GRANT ALL PRIVILEGES ON DATABASE user_db TO securechat;
GRANT ALL PRIVILEGES ON DATABASE contact_db TO securechat;
GRANT ALL PRIVILEGES ON DATABASE chat_db TO securechat;
GRANT ALL PRIVILEGES ON DATABASE media_db TO securechat;
GRANT ALL PRIVILEGES ON DATABASE story_db TO securechat;
GRANT ALL PRIVILEGES ON DATABASE emoji_db TO securechat;
GRANT ALL PRIVILEGES ON DATABASE notification_db TO securechat;
