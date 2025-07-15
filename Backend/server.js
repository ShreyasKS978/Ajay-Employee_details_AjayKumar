const express = require('express');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

dotenv.config();

const app = express();

// CORS middleware
app.use(cors({
  origin: [
    'http://13.203.228.93:8110', // Login Server
    'http://13.203.228.93:3029', // Employee Server
    'http://13.203.228.93:5500', // Live Server (Default)
    'http://127.0.0.1:5500', // Live Server (IP)
  ]
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Multer configuration
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const validTypes = ['image/jpeg', 'image/png'];
    if (!validTypes.includes(file.mimetype)) {
      return cb(new Error('Only JPEG or PNG images are allowed'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// PostgreSQL connection
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'postgres',
  database: process.env.DB_NAME || 'auth_db',
  password: process.env.DB_PASSWORD || 'admin123',
  port: process.env.DB_PORT || 5432,
});

// Initialize database
async function initializeDatabase() {
  try {
    // Check and create employees table if needed
    const employeesTableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'employees'
      );
    `);

    if (!employeesTableCheck.rows[0].exists) {
      console.log('Creating employees table...');
      await pool.query(`
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
      `);
      console.log('Employees table created successfully.');
    }

    // Check if profile_image column exists in employees table
    const columnCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'employees' 
        AND column_name = 'profile_image'
      );
    `);

    if (!columnCheck.rows[0].exists) {
      console.log('Adding profile_image column to employees table...');
      await pool.query('ALTER TABLE employees ADD COLUMN profile_image VARCHAR(255);');
      console.log('profile_image column added successfully.');
    }

    console.log('Database initialization complete');
  } catch (err) {
    console.error('Error initializing database:', err);
    process.exit(1);
  }
}

// Database connection test
pool.connect((err, client, release) => {
  if (err) {
    console.error('Database connection error:', err);
    process.exit(1);
  } else {
    console.log('Connected to PostgreSQL database');
    release();
    initializeDatabase();
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ 
      status: 'OK',
      database: 'Connected',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Health check error:', err);
    res.status(500).json({ 
      status: 'Error',
      error: 'Database connection failed',
      details: err.message 
    });
  }
});

// Serve employee management page
app.get('/employees', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'employees.html'));
});

// Get all employees (fixed to use employees table instead of users)
app.get('/api/all-users', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, profile_image FROM employees ORDER BY id DESC'
    );
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (err) {
    console.error('Error in GET /api/all-users:', {
      message: err.message,
      stack: err.stack,
      code: err.code
    });
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch employees',
      details: err.message
    });
  }
});

// Add or update employee
app.post('/api/add-employee', upload.single('profileImage'), async (req, res) => {
  try {
    const {
      id, name, role, gender, dob, location, email, phone, joinDate, experience, skills, achievement
    } = req.body;
    const profileImage = req.file ? `uploads/${req.file.filename}` : null;

    // Validation
    if (!id || !name || !role || !gender || !dob || !location || !email || !phone || !joinDate || !experience || !skills || !achievement) {
      return res.status(400).json({ 
        success: false,
        error: 'All fields are required' 
      });
    }

    if (!id.match(/^[A-Z]{3}[0-9]{4}$/)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid Employee ID format (should be ABC1234 format)' 
      });
    }

    if (!email.match(/^[a-zA-Z][a-zA-Z0-9._-]*[a-zA-Z0-9]@astrolitetech\.com$/)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid email format (must be @astrolitetech.com)' 
      });
    }

    if (!phone.match(/^[0-9]{10}$/)) {
      return res.status(400).json({ 
        success: false,
        error: 'Phone number must be 10 digits' 
      });
    }

    // Check if employee exists
    const existing = await pool.query('SELECT id FROM employees WHERE id = $1', [id]);
    
    if (existing.rows.length > 0) {
      // Update existing employee
      await pool.query(
        `UPDATE employees SET 
          name = $1, role = $2, gender = $3, dob = $4, location = $5, email = $6, 
          phone = $7, join_date = $8, experience = $9, skills = $10, achievement = $11, 
          profile_image = COALESCE($12, profile_image) 
        WHERE id = $13`,
        [name, role, gender, dob, location, email, phone, joinDate, experience, skills, achievement, profileImage, id]
      );
      res.status(200).json({ 
        success: true,
        message: 'Employee updated successfully', 
        profile_image: profileImage 
      });
    } else {
      // Create new employee
      await pool.query(
        `INSERT INTO employees 
          (id, name, role, gender, dob, location, email, phone, join_date, experience, skills, achievement, profile_image) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [id, name, role, gender, dob, location, email, phone, joinDate, experience, skills, achievement, profileImage]
      );
      res.status(201).json({ 
        success: true,
        message: 'Employee added successfully', 
        profile_image: profileImage 
      });
    }
  } catch (err) {
    console.error('Error in POST /api/add-employee:', err);
    if (err.code === '23505') {
      res.status(400).json({ 
        success: false,
        error: 'Employee ID already exists' 
      });
    } else if (err.message.includes('Only JPEG or PNG')) {
      res.status(400).json({ 
        success: false,
        error: err.message 
      });
    } else {
      res.status(500).json({ 
        success: false,
        error: 'Server error', 
        details: err.message 
      });
    }
  }
});

// Get all employees (detailed)
app.get('/api/employees', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM employees ORDER BY id DESC');
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (err) {
    console.error('Error in GET /api/employees:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch employees',
      details: err.message 
    });
  }
});

// Delete employee
app.delete('/api/delete-employee/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM employees WHERE id = $1 RETURNING *', [id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Employee not found' 
      });
    }
    
    res.json({ 
      success: true,
      message: 'Employee deleted successfully',
      deletedEmployee: result.rows[0] 
    });
  } catch (err) {
    console.error('Error in DELETE /api/delete-employee:', err);
    res.status(500).json({ 
      success: false,
      error: 'Server error', 
      details: err.message 
    });
  }
});

// Default route for favicon to suppress 404
app.get('/favicon.ico', (req, res) => res.status(204).end());

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({ 
    success: false,
    error: 'Endpoint not found' 
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    success: false,
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.EMPLOYEE_PORT || 3029;
app.listen(PORT, () => {
  console.log(`Employee server running on port ${PORT}`);
});