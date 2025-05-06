const mongoose = require("mongoose");

const cFormSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
    required: true,
  },
  pincode: {
    type: Number,
    required: true,
    maxLength: 6,
  },
  address: {
    type: String,
    required: true,
  },
});

const cForm = mongoose.model("cForm", cFormSchema);

module.exports = cForm;
