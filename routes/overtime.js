const express = require('express');
const { Parser } = require('json2csv');
const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

async function getOvertimeData(from, to, department) {
  const fromDate = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  fromDate.setHours(0, 0, 0, 0);
  const toDate = to ? new Date(to) : new Date();
  toDate.setHours(23, 59, 59, 999);

  // Build employee filter
  let empFilter = { status: 'active' };
  if (department) empFilter.department = department;
  const employees = await Employee.find(empFilter);
  const empIds = employees.map((e) => e._id);

  // Aggregate attendance
  const pipeline = [
    {
      $match: {
        employeeId: { $in: empIds },
        date: { $gte: fromDate, $lte: toDate },
      },
    },
    {
      $group: {
        _id: '$employeeId',
        totalHours: { $sum: '$hoursWorked' },
        overtimeHours: { $sum: '$overtimeHours' },
        daysPresent: {
          $sum: {
            $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0],
          },
        },
      },
    },
  ];

  const aggregated = await Attendance.aggregate(pipeline);

  const result = employees.map((emp) => {
    const agg = aggregated.find((a) => a._id.toString() === emp._id.toString());
    const totalHours = agg ? parseFloat(agg.totalHours.toFixed(2)) : 0;
    const overtimeHours = agg ? parseFloat(agg.overtimeHours.toFixed(2)) : 0;
    const daysPresent = agg ? agg.daysPresent : 0;
    const regularHours = Math.max(0, totalHours - overtimeHours);
    const regularPay = parseFloat((regularHours * emp.hourlyRate).toFixed(2));
    const overtimePay = parseFloat((overtimeHours * emp.hourlyRate * emp.overtimeMultiplier).toFixed(2));
    const totalPay = parseFloat((regularPay + overtimePay).toFixed(2));

    return {
      employeeId: emp.employeeId,
      employeeMongoId: emp._id,
      name: emp.name,
      department: emp.department,
      designation: emp.designation,
      hourlyRate: emp.hourlyRate,
      overtimeMultiplier: emp.overtimeMultiplier,
      daysPresent,
      totalHours,
      regularHours: parseFloat(regularHours.toFixed(2)),
      overtimeHours,
      regularPay,
      overtimePay,
      totalPay,
    };
  });

  return result;
}

// GET /api/overtime/report
router.get('/report', authenticate, async (req, res) => {
  try {
    const { from, to, department } = req.query;
    const data = await getOvertimeData(from, to, department);
    res.json({ success: true, report: data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/overtime/export-csv
router.get('/export-csv', authenticate, async (req, res) => {
  try {
    const { from, to, department } = req.query;
    const data = await getOvertimeData(from, to, department);

    const fields = [
      { label: 'Employee ID', value: 'employeeId' },
      { label: 'Name', value: 'name' },
      { label: 'Department', value: 'department' },
      { label: 'Designation', value: 'designation' },
      { label: 'Days Present', value: 'daysPresent' },
      { label: 'Total Hours', value: 'totalHours' },
      { label: 'Regular Hours', value: 'regularHours' },
      { label: 'Overtime Hours', value: 'overtimeHours' },
      { label: 'Hourly Rate ($)', value: 'hourlyRate' },
      { label: 'Regular Pay ($)', value: 'regularPay' },
      { label: 'Overtime Pay ($)', value: 'overtimePay' },
      { label: 'Total Pay ($)', value: 'totalPay' },
    ];

    const parser = new Parser({ fields });
    const csv = parser.parse(data);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=overtime-report.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/overtime/payroll-summary - group by department
router.get('/payroll-summary', authenticate, async (req, res) => {
  try {
    const { from, to } = req.query;
    const data = await getOvertimeData(from, to, null);

    const deptMap = {};
    data.forEach((item) => {
      if (!deptMap[item.department]) {
        deptMap[item.department] = {
          department: item.department,
          totalEmployees: 0,
          totalHours: 0,
          totalOvertimeHours: 0,
          totalRegularPay: 0,
          totalOvertimePay: 0,
          totalPay: 0,
        };
      }
      deptMap[item.department].totalEmployees++;
      deptMap[item.department].totalHours += item.totalHours;
      deptMap[item.department].totalOvertimeHours += item.overtimeHours;
      deptMap[item.department].totalRegularPay += item.regularPay;
      deptMap[item.department].totalOvertimePay += item.overtimePay;
      deptMap[item.department].totalPay += item.totalPay;
    });

    const summary = Object.values(deptMap).map((d) => ({
      ...d,
      totalHours: parseFloat(d.totalHours.toFixed(2)),
      totalOvertimeHours: parseFloat(d.totalOvertimeHours.toFixed(2)),
      totalRegularPay: parseFloat(d.totalRegularPay.toFixed(2)),
      totalOvertimePay: parseFloat(d.totalOvertimePay.toFixed(2)),
      totalPay: parseFloat(d.totalPay.toFixed(2)),
    }));

    res.json({ success: true, summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
