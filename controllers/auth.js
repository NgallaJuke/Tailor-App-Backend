const mongoose = require("mongoose");
const User = require("../models/User");
const ErrorResponse = require("../utils/errorResponse");
const asyncHandler = require("../middleware/async");
const fs = require("fs");

// @desc    Register User
// @route   POST /api/v1/auth/register
// @access  Public
exports.Register = asyncHandler(async (req, res) => {
  // get this variable from the req.body = form registration
  const { email, firstName, lastName, userName, role, password } = req.body;

  // let avatar = {};
  // avatar.data = fs.readFileSync("./public/avatars/default.png");
  // avatar.contentType = "image.png";
  // create user
  const user = await User.create({
    email,
    firstName,
    lastName,
    userName,
    role,
    // avatar,
    password,
  });

  SendTokentoCookieResponse(user, 200, res);
});

// @desc    Login User
// @route   POST /api/v1/auth/login
// @access  Public
exports.Login = asyncHandler(async (req, res, next) => {
  // get this variable from the req.body = form registration
  //check if the email and tha password are provided
  const { email, password } = req.body;
  if (!email || !password)
    return next(
      new ErrorResponse("Please provide and email and a password", 400)
    );

  //find the user with that email
  const user = await User.findOne({ email }).select("+password");
  if (!user) return next(new ErrorResponse("Invalid credentials", 401));

  //Compare the user's password to the user's password saved in the database using the methods created at the User Model
  const pwdMatches = await user.matchPassword(password);
  if (!pwdMatches) return next(new ErrorResponse("Invalid credentials", 401));
  SendTokentoCookieResponse(user, 200, res);
});

// @desc    Get Current Logged User
// @route   GET /api/v1/auth/current-user
// @access  Private
exports.CurrentUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);
  if (!user) return next(new ErrorResponse("User not found", 404));

  // get resset token
  res.status(200).json({ success: true, data: user });
});

// @desc    Forgot Password
// @route   GET /api/v1/auth/forget-password
// @access  Private
exports.ForgetPassword = asyncHandler(async (req, res, next) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user)
    return next(new ErrorResponse("No user with that email found", 404));
  const resetToken = user.getResetPasswordToken();
  console.log("resetToken", resetToken);
  await user.save({ validateBeforeSave: false });

  res.status(200).json({ success: true, data: user });
});

// fonction to create the token send it via cookie to the Headers
const SendTokentoCookieResponse = async (user, status, res) => {
  //get the token from the methods we created at the User Model: getSignedJWTtoken()
  const token = await user.getSignedJWTtoken();

  //options for the cookie
  // process.env.JWT_COOK_EXP is in Day so trun in into ms
  const options = {
    expires: new Date(
      Date.now() + process.env.JWT_COOK_EXP * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
  };

  if (process.env.NODE_ENV === "production") options.secure = true;

  res
    .status(status)
    .cookie("token", token, options)
    .json({ success: true, token });
};
