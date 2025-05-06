const mongoose = require("mongoose");

const tailorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  phone: {
    type: String,
    required: true
  },
  experience: {
    type: Number,
    required: true
  },
  expertise: {
    type: String,
    required: true
  },
  location: {
    type: String,
    required: true
  },
  dateApplied: {
    type: Date,
    default: Date.now
  }
});

const Tailor = mongoose.model("Tailor", tailorSchema);

module.exports = Tailor;
