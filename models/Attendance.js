const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: [true, 'Employee ID is required'],
  },
  date: {
    type: Date,
    required: [true, 'Date is required'],
  },
  checkIn: {
    type: Date,
  },
  checkOut: {
    type: Date,
  },
  hoursWorked: {
    type: Number,
    default: 0,
  },
  overtimeHours: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['present', 'absent', 'half-day', 'late'],
    default: 'present',
  },
  notes: {
    type: String,
    trim: true,
  },
});

// Calculate hours worked and overtime
attendanceSchema.pre('save', function (next) {
  if (this.checkIn && this.checkOut) {
    const diffMs = this.checkOut - this.checkIn;
    this.hoursWorked = diffMs / (1000 * 60 * 60);
    this.overtimeHours = Math.max(0, this.hoursWorked - 8);
  }
  next();
});

// Unique compound index on employeeId + date
attendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
