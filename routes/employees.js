const express = require('express');
const Employee = require('../models/Employee');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/employees - get all employees
router.get('/', authenticate, async (req, res) => {
  try {
    let query = {};

    // Employees can only see themselves
    if (req.user.role === 'employee') {
      if (req.user.employeeRef) {
        query._id = req.user.employeeRef;
      } else {
        return res.json({ success: true, employees: [] });
      }
    }

    const employees = await Employee.find(query).sort({ createdAt: -1 });
    res.json({ success: true, employees });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/employees/departments/list - get distinct departments
router.get('/departments/list', authenticate, async (req, res) => {
  try {
    const departments = await Employee.distinct('department');
    res.json({ success: true, departments });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/employees/:id - get single employee
router.get('/:id', authenticate, async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }
    res.json({ success: true, employee });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/employees - create employee
router.post('/', authenticate, authorize('admin', 'hr'), async (req, res) => {
  try {
    const employee = await Employee.create(req.body);
    res.status(201).json({ success: true, employee });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ success: false, message: 'Employee ID or email already exists' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/employees/:id - update employee
router.put('/:id', authenticate, authorize('admin', 'hr'), async (req, res) => {
  try {
    const employee = await Employee.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }
    res.json({ success: true, employee });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/employees/:id - delete employee
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const employee = await Employee.findByIdAndDelete(req.params.id);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }
    res.json({ success: true, message: 'Employee deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
