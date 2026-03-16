const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    department: {
      type: String,
      required: [true, 'Department is required'],
      trim: true,
    },
    designation: {
      type: String,
      required: [true, 'Designation is required'],
      trim: true,
    },
    hourlyRate: {
      type: Number,
      required: [true, 'Hourly rate is required'],
      default: 15,
      min: 0,
    },
    overtimeMultiplier: {
      type: Number,
      default: 1.5,
      min: 1,
    },
    joiningDate: {
      type: Date,
      default: Date.now,
    },
    phone: {
      type: String,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
  },
  { timestamps: true }
);

// Auto-generate employeeId if not provided
employeeSchema.pre('save', async function (next) {
  if (!this.employeeId) {
    const count = await mongoose.model('Employee').countDocuments();
    this.employeeId = 'EMP' + String(count + 1).padStart(4, '0');
  }
  next();
});

module.exports = mongoose.model('Employee', employeeSchema);
