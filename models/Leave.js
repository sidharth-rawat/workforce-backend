const mongoose = require('mongoose');

// Helper: count business days between two dates inclusive
function countBusinessDays(startDate, endDate) {
  let count = 0;
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}

const leaveSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: [true, 'Employee ID is required'],
  },
  type: {
    type: String,
    enum: ['sick', 'casual', 'annual', 'unpaid', 'maternity', 'paternity'],
    required: [true, 'Leave type is required'],
  },
  fromDate: {
    type: Date,
    required: [true, 'From date is required'],
  },
  toDate: {
    type: Date,
    required: [true, 'To date is required'],
  },
  totalDays: {
    type: Number,
  },
  reason: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  approvedAt: {
    type: Date,
  },
  appliedAt: {
    type: Date,
    default: Date.now,
  },
});

// Pre-save: calculate total business days
leaveSchema.pre('save', function (next) {
  if (this.fromDate && this.toDate) {
    this.totalDays = countBusinessDays(this.fromDate, this.toDate);
  }
  next();
});

module.exports = mongoose.model('Leave', leaveSchema);
