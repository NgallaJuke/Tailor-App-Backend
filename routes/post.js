const router = require("express").Router();
const Post = require("../models/Post");
const {
  GetPostByUser,
  getAllPosts,
  CreatePost,
  DeletePost,
  LikePost,
  UnlikePost,
  GetSinglePost,
  CommentPost,
  LikeComment,
  UnlikeComment,
  SavePost,
  DeleteSavedPost,
} = require("../controllers/post");
const { Protect, Authorize } = require("../middleware/auth");
const advancedResults = require("../middleware/advancedResults");

router.route("/").get(advancedResults(Post), getAllPosts);
router.route("/:userName").get(advancedResults(Post), GetPostByUser);
router.route("/create").post(Protect, Authorize("tailor"), CreatePost);
router.route("/delete").delete(Protect, Authorize("tailor"), DeletePost);
router.route("/:id").get(GetSinglePost);
router.route("/:id/like").put(Protect, LikePost);
router.route("/:id/unlike").put(Protect, UnlikePost);
router.route("/:id/comment").post(Protect, CommentPost);
router.route("/:id/comment/like").put(Protect, LikeComment);
router.route("/:id/comment/unlike").put(Protect, UnlikeComment);
router.route("/:id/save").put(Protect, SavePost);
router.route("/save/:id/delete").delete(Protect, DeleteSavedPost);

module.exports = router;
