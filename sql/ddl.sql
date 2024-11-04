-- Create a new database
DROP DATABASE IF EXISTS ticketing;
CREATE DATABASE IF NOT EXISTS ticketing;

-- Use the newly created database
USE ticketing;

-- Ta bort tabeller om de redan finns
DROP TABLE IF EXISTS tickets;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS knowledge_base;


CREATE TABLE `tickets` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `description` text NOT NULL,
  `status` enum('open','in_progress','closed') DEFAULT 'open',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `attachment` varchar(255) DEFAULT NULL,
  `category` varchar(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=28 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- Recreate the table
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'agent', 'user') NOT NULL,
    department VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS knowledge_base (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    author_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (author_id) REFERENCES users(id)
);


-- Optionally insert the default admin again
INSERT INTO users (username, email, password, role, department)
VALUES ('admin', 'admin@gmail.com', '$2b$10$UZYaCi06k7IS.5U/8m0W1uejI0rffy2suWafEDLlB04FjvC3zDncK', 'Admin', 'IT');

CREATE TABLE IF NOT EXISTS categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL
);

INSERT INTO categories (name) VALUES 
    ('IT Support'),
    ('Hardware'),
    ('Network'),
    ('HR');


DELIMITER $$
CREATE PROCEDURE CreateUser (
    IN p_username VARCHAR(255),
    IN p_password VARCHAR(255),
    IN p_email VARCHAR(255),
    IN p_role ENUM('user', 'agent'),
    IN p_department VARCHAR(255),
    IN p_creator_role ENUM('Admin', 'user', 'agent')  -- Valid ENUM values only
)
BEGIN
    DECLARE existing_user_count INT;

    -- Only Admin can create new users
    IF p_creator_role != 'Admin' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only Admin can create new users';
    END IF;

    -- Check if the user with the same email already exists
    SELECT COUNT(*) INTO existing_user_count FROM users WHERE email = p_email;

    IF existing_user_count > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'User with this email already exists';
    ELSE
        -- Insert into users table
        INSERT INTO users (username, password, email, role, department)
        VALUES (p_username, p_password, p_email, p_role, p_department);
    END IF;
END$$
DELIMITER ;


-- Stored procedure for admin login
DELIMITER $$
CREATE PROCEDURE AdminLogin (
    IN p_email VARCHAR(100),
    IN p_password VARCHAR(255)
)
BEGIN
    DECLARE admin_count INT;

    -- Check if admin credentials are valid
    SELECT COUNT(*) INTO admin_count 
    FROM users 
    WHERE email = p_email 
    AND password = p_password 
    AND role = 'Admin';

    IF admin_count = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid admin credentials';
    END IF;
END$$
DELIMITER ;

ALTER TABLE tickets ADD COLUMN assigned_to INT;
ALTER TABLE tickets ADD COLUMN user_id INT;
ALTER TABLE tickets ADD COLUMN agent_id INT;