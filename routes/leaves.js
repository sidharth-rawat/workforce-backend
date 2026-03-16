const express = require('express');
const Leave = require('../models/Leave');
const Employee = require('../models/Employee');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Leave entitlements per year
const LEAVE_ENTITLEMENTS = {
  annual: 12,
  sick: 10,
  casual: 7,
  unpaid: 365,
  maternity: 90,
  paternity: 14,
};

// POST /api/leaves/apply
router.post('/apply', authenticate, async (req, res) => {
  try {
    const { type, fromDate, toDate, reason, employeeId } = req.body;

    let empId = employeeId;
    if (!empId && req.user.employeeRef) {
      empId = req.user.employeeRef;
    }
    if (!empId) {
      return res.status(400).json({ success: false, message: 'Employee reference required' });
    }

    const leave = await Leave.create({
      employeeId: empId,
      type,
      fromDate,
      toDate,
      reason,
    });

    await leave.populate('employeeId');
    res.status(201).json({ success: true, leave });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/leaves/my - get own leaves
router.get('/my', authenticate, async (req, res) => {
  try {
    let empId = req.user.employeeRef;
    if (!empId) {
      return res.json({ success: true, leaves: [] });
    }

    const leaves = await Leave.find({ employeeId: empId })
      .populate('employeeId')
      .populate('approvedBy', 'name email')
      .sort({ appliedAt: -1 });

    res.json({ success: true, leaves });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/leaves/all - get all leaves (admin/hr/manager)
router.get('/all', authenticate, authorize('admin', 'hr', 'manager'), async (req, res) => {
  try {
    const { status } = req.query;
    let query = {};
    if (status) query.status = status;

    const leaves = await Leave.find(query)
      .populate('employeeId')
      .populate('approvedBy', 'name email')
      .sort({ appliedAt: -1 });

    res.json({ success: true, leaves });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/leaves/:id/approve
router.put('/:id/approve', authenticate, authorize('admin', 'hr', 'manager'), async (req, res) => {
  try {
    const leave = await Leave.findByIdAndUpdate(
      req.params.id,
      {
        status: 'approved',
        approvedBy: req.user._id,
        approvedAt: new Date(),
      },
      { new: true }
    )
      .populate('employeeId')
      .populate('approvedBy', 'name email');

    if (!leave) {
      return res.status(404).json({ success: false, message: 'Leave not found' });
    }

    res.json({ success: true, leave });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/leaves/:id/reject
router.put('/:id/reject', authenticate, authorize('admin', 'hr', 'manager'), async (req, res) => {
  try {
    const leave = await Leave.findByIdAndUpdate(
      req.params.id,
      {
        status: 'rejected',
        approvedBy: req.user._id,
        approvedAt: new Date(),
      },
      { new: true }
    )
      .populate('employeeId')
      .populate('approvedBy', 'name email');

    if (!leave) {
      return res.status(404).json({ success: false, message: 'Leave not found' });
    }

    res.json({ success: true, leave });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/leaves/balance/:employeeId
router.get('/balance/:employeeId', authenticate, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const currentYear = new Date().getFullYear();
    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear, 11, 31, 23, 59, 59);

    // Get all approved leaves for this employee this year
    const approvedLeaves = await Leave.find({
      employeeId,
      status: 'approved',
      fromDate: { $gte: yearStart, $lte: yearEnd },
    });

    // Calculate used days per type
    const usedDays = {};
    approvedLeaves.forEach((leave) => {
      if (!usedDays[leave.type]) usedDays[leave.type] = 0;
      usedDays[leave.type] += leave.totalDays || 0;
    });

    // Calculate balance
    const balance = {};
    Object.keys(LEAVE_ENTITLEMENTS).forEach((type) => {
      const entitled = LEAVE_ENTITLEMENTS[type];
      const used = usedDays[type] || 0;
      balance[type] = {
        entitled,
        used,
        remaining: Math.max(0, entitled - used),
      };
    });

    res.json({ success: true, balance });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
