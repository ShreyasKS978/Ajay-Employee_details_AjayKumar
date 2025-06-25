


CREATE TABLE employees (
    id VARCHAR(7) PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    role VARCHAR(40) NOT NULL,
    gender VARCHAR(10) NOT NULL,
    dob DATE NOT NULL,
    location VARCHAR(40) NOT NULL,
    email VARCHAR(50) NOT NULL,
    phone VARCHAR(10) NOT NULL,
    join_date DATE NOT NULL,
    experience INTEGER NOT NULL,
    skills TEXT NOT NULL,
    achievement TEXT NOT NULL,
    profile_image VARCHAR(255)
);

