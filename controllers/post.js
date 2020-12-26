const mongoose = require("mongoose");
const Post = require("../models/Post");
const User = require("../models/User");
const Comment = require("../models/Comment");
const ObjectId = require("mongoose").Types.ObjectId;
const asyncHandler = require("../middleware/async");
const ErrorResponse = require("../utils/errorResponse");
const client = require("../utils/redis");
const path = require("path");
const {
  SetUserFeed,
  SetUserHomeFeed,
  GetUserHomeFeed,
  SetUserProfil,
  GetUserProfil,
  GetUserFeed,
  SetPostCache,
  GetPostCache,
  DeletePostsCache,
} = require("../utils/redis-func");

// @desc    Create A Post
// @route   GET /api/v1/post/create
// @access  Private/Tailors
exports.CreatePost = asyncHandler(async (req, res, next) => {
  let picture = [];
  let files = [];
  let error = "";

  if (!req.files || Array.from(req.files.picture).length < 0) {
    return next(new ErrorResponse("Please add a photo", 400));
  }

  // if there is only one file
  if (Array.from(req.files.picture).length === 0) {
    const file = req.files.picture;
    fileCheck(req.user.name, file, (count = 0), picture, error);
    if (error) return console.log("Error :", error);
    // move the file
    moveFileToPosts_pic(file);
  } else {
    let count = 0;
    // save the files image
    Array.from(req.files.picture).forEach((file) => {
      fileCheck(req.user.name, file, count, picture, error);
      count++;
      // move the file
      files.push(file);
    });

    if (error) return console.log("Error :", error);

    //move all the files to public folder Later cahnge this part to save the file in AWS
    files.forEach((file) => {
      moveFileToPosts_pic(file);
    });
  }

  // check if the description has any #(tags) in it
  const reg = /#\S+/g;
  let tags = [];
  if (req.body.description.match(reg)) {
    tags = req.body.description.match(reg);
  }

  if (picture.length === 0)
    return next(new ErrorResponse("Error while uploading the photos", 500));

  try {
    const postOwner = await User.findById(req.user.id);
    if (!postOwner) {
      return next(new ErrorResponse("User not found in DB.", 404));
    }
    // Save the post to the Database
    const post = await Post.create({
      picture,
      description: req.body.description,
      tags,
      user: req.user.id,
      postOwner,
    });

    // Save the post to Redis
    SetPostCache(post.id, post);

    // send the post to the user's followers timeline
    client.get(`UserProfil:${req.user.name}`, async (err, user) => {
      if (err) return next(new ErrorResponse("Server error.", 500));

      if (!user) {
        // if Redis doesn't give back the user then get him from the database
        const userdb = await User.findById(req.user.id);
        if (!userdb) return next(new ErrorResponse("User is not found", 404));
        // update user own timeline
        SetUserFeed(userdb.id, post.id);

        // update the user homefeed
        SetUserHomeFeed(userdb.userName, post.id);

        // Reset the User Profil in Redis in case it was lost
        SetUserProfil(req.user.name, userdb);
        let UserProfil = JSON.parse(userdb);
        const followers = UserProfil.follower;
        if (followers) {
          followers.forEach((follower) => {
            // Update the followers's Timeline
            SetUserFeed(follower, post.id);
          });
        }
      } else {
        let UserProfil = JSON.parse(user);
        // update user own timeline
        SetUserFeed(UserProfil._id, post.id);
        // upadate the user homefeed
        SetUserHomeFeed(UserProfil.userName, post.id);

        const followers = UserProfil.follower;
        if (followers) {
          followers.forEach((follower) => {
            // Update the followers's Timeline
            SetUserFeed(follower, post.id);
          });
        }
      }
    });
    res.status(200).json({ success: true, post: post });
  } catch (error) {
    console.log("Error", error);
  }
});

// @desc    Delete A Post
// @route   DELETE /api/v1/post/delete
// @access  Private/Tailors
exports.DeletePost = asyncHandler(async (req, res, next) => {
  const post = await Post.findOne({ user: req.user.id });
  if (!post)
    return next(
      new ErrorResponse("User not authorize to make this request", 401)
    );
  DeletePostsCache(post.id);
  post.deleteOne();

  res.status(200).json({ success: true, post: "the Post has been deleted." });
});

// @desc    Get All Posts
// @route   GET /api/v1/auth/post
// @access  Public
exports.getAllPosts = asyncHandler(async (req, res, next) => {
  const post = await Post.find();
  if (!post) return next(new ErrorResponse("Posts not found. ", 404));
  res.status(200).json({ success: true, post });
});

// @desc    Get A Post
// @route   GET /api/v1/post/:id
// @access  Public
exports.GetSinglePost = asyncHandler(async (req, res, next) => {
  GetPostCache(req.params.id, async (err, post) => {
    if (err) return next(new ErrorResponse("Error get Cached post.", 500));
    if (!post) {
      //get teh post from teh db
      const post = await Post.findById(req.params.id);
      if (!post) return next(new ErrorResponse("Post not found", 404));
      //create the post in Posts Cache
      SetPostCache(req.params.id, post);
      res.status(200).json({ success: true, post });
    }
    res.status(200).json({ success: true, post });
  });
});

// @desc    Get User's Feed
// @route   GET /api/v1/post/timeline
// @access  Private
exports.GetUserFeed = asyncHandler(async (req, res, next) => {
  GetUserFeed(req.user.id, res, next);
});

// @desc    Get User's HomeFeed
// @route   GET /api/v1/post/:userName/home-timeline
// @access  Private
exports.GetUserHomeFeed = asyncHandler(async (req, res, next) => {
  GetUserHomeFeed(req.params.userName, res, next);
});

// // @desc    Like A Post
// // @route   PUT /api/v1/post/:id/like
// // @access  Private
exports.LikePost = asyncHandler(async (req, res, next) => {
  let post = await Post.findById(req.params.id);

  if (!post) return next(new ErrorResponse("Post not found", 404));

  if (
    post.likes.liker.filter((liker) => liker.toString() === req.user.id)
      .length > 0
  )
    return next(new ErrorResponse("Post already liked.", 403));

  post.likes.liker.push(req.user.id);
  post.likes.count++;

  //check if somehow the user didn't hace a cahced Profil
  GetUserProfil(req.user.name, async (err, user) => {
    if (err) return next(new ErrorResponse("Error get Cached post.", 500));
    if (!user) {
      // if the user follows no one yet
      const userdb = await User.findById(req.user.id);
      SetUserProfil(req.user.name, userdb);
    }

    // Update the post in Redis
    SetPostCache(post.id, post);
    //update the post in DB
    await post.save();
    res.status(200).json({ success: true, post });
  });
});

// // @desc    UnLike A Post
// // @route   PUT /api/v1/post/:id/unlike
// // @access  Private
exports.UnlikePost = asyncHandler(async (req, res, next) => {
  let post = await Post.findById(req.params.id);
  if (!post) return next(new ErrorResponse("Post not found", 404));

  if (
    !post.likes.liker.filter((liker) => liker.toString() === req.user.id)
      .length > 0
  )
    return next(new ErrorResponse("Post not liked.", 403));
  post.likes.liker.pull(req.user.id);
  post.likes.count--;

  // Update the post in Redis
  SetPostCache(post.id, post);
  // update on database
  post.save();

  res.status(200).json({ success: true, post });
});

// // @desc    Comment A Post
// // @route   PUT /api/v1/post/:id/comment
// // @access  Private
exports.CommentPost = asyncHandler(async (req, res, next) => {
  // get the post that the connected user comment on
  const post = await Post.findById(req.params.id);
  if (!post) return next(new ErrorResponse("Post not found", 404));

  // check if the description has any #(tags) in it
  const reg = /#\S+/g;
  let tags = [];
  if (req.body.message.match(reg)) {
    tags = req.body.message.match(reg);
  }

  const comment = await Comment.create({
    message: req.body.message,
    tags,
    user: req.user.id,
    post: req.params.id,
  });
  if (!comment)
    return next(new ErrorResponse("Error while creating the comment", 500));

  post.comments.comment.push(comment.id);
  post.comments.count++;
  // Update the post in Redis
  SetPostCache(post.id, post);
  post.save();
  const user = await User.findById(req.user.id);
  if (!user) return next(new ErrorResponse("User Not Found", 404));
  user.comments.comment.push(comment.id);
  user.save();
  res.status(200).json({ success: true, comment, post, user });
});

// // @desc    Get All The Comments In A Post
// // @route   GET /api/v1/post/:id/comments
// // @access  Private
exports.GetAllCommentsInPost = asyncHandler(async (req, res, next) => {
  // get the post that the connected user comment on
  const post = await Post.findById(req.params.id).populate("comments.comment");
  if (!post)
    return next(
      new ErrorResponse("Post not found withi comments not found", 404)
    );

  res.status(200).json({ success: true, comments: post.comments.comment });
});

// // @desc    Like A Comment
// // @route   PUT /api/v1/post/comment/:id/like
// // @access  Private
exports.LikeComment = asyncHandler(async (req, res, next) => {
  let comment = await Comment.findById(req.params.id);

  if (!comment) return next(new ErrorResponse("Post not found", 404));

  if (
    !comment.likes.liker.filter((liker) => liker.toString() === req.user.id)
      .length > 0
  ) {
    comment.likes.liker.push(req.user.id);
    comment.likes.count++;
  }
  comment.save();

  res.status(200).json({ success: true, comment });
});

// // @desc    UnLike A Comment
// // @route   PUT /api/v1/post/comment/:id/unlike
// // @access  Private
exports.UnlikeComment = asyncHandler(async (req, res, next) => {
  let comment = await Comment.findById(req.params.id);
  if (!comment) return next(new ErrorResponse("Comment not found", 404));

  if (
    comment.likes.liker.filter((liker) => liker.toString() === req.user.id)
      .length > 0
  ) {
    comment.likes.liker.pull(req.user.id);
    comment.likes.count--;
  }
  comment.save();

  res.status(200).json({ success: true, comment });
});

// // @desc    Save A Post
// // @route   PUT /api/v1/post/:id/save
// // @access  Private
exports.SavePost = asyncHandler(async (req, res, next) => {
  let post = await Post.findById(req.params.id);
  if (!post) return next(new ErrorResponse("Post not found.", 404));
  let user = await User.findById(req.user.id);
  if (!user) return next(new ErrorResponse("User not found.", 404));

  if (post.user == user.id) return next(new ErrorResponse("Owned post.", 403));

  if (user.saved.filter((saved) => saved.toString() === req.user.id).length > 0)
    return next(new ErrorResponse("Post already saved.", 403));

  user.saved.push(post.id);
  // update the user in Database
  user.save();
  // update the user in Redis
  SetUserProfil(req.user.name, user);
  res.status(200).json({ success: true, post });
});

// // @desc    Delete A Saved Post
// // @route   DELETE /api/v1/post/save/:id/delete
// // @access  Private/Tailor
exports.DeleteSavedPost = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);
  if (!user) return next(new ErrorResponse("User not found.", 404));
  if (!user.saved.includes(req.params.id))
    return next(new ErrorResponse("This post has not been saved.", 404));

  user.saved.pull(req.params.id);
  // update the user in Database
  user.save();
  // update the user in Redis
  SetUserProfil(req.user.name, user);
  res
    .status(200)
    .json({ success: true, post: "The saved post has been deleted." });
});

/* -----TODO----- */
/* 
  --- Put the comments on redis and link like the post are linked to userTimeline
  --- Gat all Saved Post by a user
 */
/* -------------- */

const fileCheck = (userName, file, count, picture, error) => {
  // make sure the file is an image
  if (!file.mimetype.startsWith("image")) {
    error = new ErrorResponse("Please upload an image file", 403);
    return next(error);
  }
  // make sure the image is not a gif
  if (file.mimetype === "image/gif") {
    error = new ErrorResponse("Gif image is not allow", 403);
    return next(error);
  }

  // check file size
  if (file.size > process.env.MAX_PIC_SIZE) {
    error = new ErrorResponse(
      `Please upload an image less than ${process.env.MAX_PIC_SIZE}Mb`,
      400
    );
    return next(error);
  }

  // Create costum file name
  file.name = `post_img[${count}]_${userName}_${Date.now()}${
    path.parse(file.name).ext
  }`;
  picture.push(file.name);
};

const moveFileToPosts_pic = (file) => {
  file.mv(`${process.env.POSTS_PIC_PATH}/${file.name}`, async (err) => {
    if (err) {
      return next(
        new ErrorResponse(`Problem while uploading the file ${file.name}`, 500)
      );
    }
  });
};
