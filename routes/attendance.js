const express = require('express');
const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Helper: get start of day
function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Helper: get end of day
function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

// POST /api/attendance/mark - mark check-in or check-out
router.post('/mark', authenticate, async (req, res) => {
  try {
    const { employeeId, notes } = req.body;

    // Determine which employee
    let empId = employeeId;
    if (!empId && req.user.employeeRef) {
      empId = req.user.employeeRef;
    }
    if (!empId) {
      return res.status(400).json({ success: false, message: 'Employee ID required' });
    }

    const today = new Date();
    const todayStart = startOfDay(today);
    const todayEnd = endOfDay(today);

    let record = await Attendance.findOne({
      employeeId: empId,
      date: { $gte: todayStart, $lte: todayEnd },
    });

    if (!record) {
      // Create new record with check-in
      record = await Attendance.create({
        employeeId: empId,
        date: todayStart,
        checkIn: today,
        status: 'present',
        notes,
      });
    } else if (!record.checkOut) {
      // Set check-out
      record.checkOut = today;
      if (notes) record.notes = notes;
      await record.save();
    } else {
      return res.status(400).json({ success: false, message: 'Already checked in and out for today' });
    }

    await record.populate('employeeId');
    res.json({ success: true, attendance: record });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/attendance/today - get all employees attendance for today
router.get('/today', authenticate, authorize('admin', 'hr', 'manager'), async (req, res) => {
  try {
    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());

    const attendance = await Attendance.find({
      date: { $gte: todayStart, $lte: todayEnd },
    }).populate('employeeId');

    // Get all active employees to show absent ones too
    const allEmployees = await Employee.find({ status: 'active' });
    const presentIds = attendance.map((a) => a.employeeId?._id?.toString());

    const result = allEmployees.map((emp) => {
      const record = attendance.find((a) => a.employeeId?._id?.toString() === emp._id.toString());
      return {
        employee: emp,
        attendance: record || null,
        status: record ? record.status : 'absent',
      };
    });

    res.json({ success: true, data: result, attendance });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/attendance/summary/:employeeId - monthly summary
router.get('/summary/:employeeId', authenticate, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { month, year } = req.query;

    const m = month ? parseInt(month) - 1 : new Date().getMonth();
    const y = year ? parseInt(year) : new Date().getFullYear();

    const fromDate = new Date(y, m, 1);
    const toDate = new Date(y, m + 1, 0, 23, 59, 59, 999);

    const records = await Attendance.find({
      employeeId,
      date: { $gte: fromDate, $lte: toDate },
    });

    const totalPresent = records.filter((r) => r.status === 'present' || r.status === 'late').length;
    const totalHalfDay = records.filter((r) => r.status === 'half-day').length;
    const totalOvertimeHours = records.reduce((sum, r) => sum + (r.overtimeHours || 0), 0);
    const totalHoursWorked = records.reduce((sum, r) => sum + (r.hoursWorked || 0), 0);
    const avgHoursPerDay = totalPresent > 0 ? totalHoursWorked / totalPresent : 0;

    res.json({
      success: true,
      summary: {
        totalPresent,
        totalHalfDay,
        totalOvertimeHours: parseFloat(totalOvertimeHours.toFixed(2)),
        totalHoursWorked: parseFloat(totalHoursWorked.toFixed(2)),
        avgHoursPerDay: parseFloat(avgHoursPerDay.toFixed(2)),
        month: m + 1,
        year: y,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/attendance/employee/:employeeId - get attendance for employee with date range
router.get('/employee/:employeeId', authenticate, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { from, to } = req.query;

    let query = { employeeId };

    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = startOfDay(new Date(from));
      if (to) query.date.$lte = endOfDay(new Date(to));
    }

    const attendance = await Attendance.find(query)
      .populate('employeeId')
      .sort({ date: -1 });

    res.json({ success: true, attendance });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/attendance/:id - edit attendance record
router.put('/:id', authenticate, authorize('admin', 'hr'), async (req, res) => {
  try {
    const record = await Attendance.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate('employeeId');

    if (!record) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }

    res.json({ success: true, attendance: record });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
