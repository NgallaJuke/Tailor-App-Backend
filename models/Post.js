const mongoose = require("mongoose");
var User = require("mongoose").model("User");

const PostSchema = new mongoose.Schema({
  picture: [{ type: String, require: [true, "Please add photo"] }],
  description: {
    type: String,
    maxlength: 180,
  },
  tags: [String],
  likes: {
    count: { type: Number, default: 0 },
    liker: [String],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  user: {
    type: mongoose.Schema.ObjectId,
    ref: "User",
    require: true,
  },
  viewedBy: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  postOwner: {
    type: Object,
    require: [true, "Please add photo"],
  },
  comments: {
    count: { type: Number, default: 0 },
    comment: [
      {
        type: mongoose.Schema.ObjectId,
        ref: "Comment",
      },
    ],
  },
});

//Cascade Delete Comments when deleting a Post /// we don't really wont to do that
PostSchema.pre(
  "deleteOne",
  { document: true, query: false },
  async function (next) {
    await this.model("Comment").deleteMany({ post: this._id });
    next();
  }
);
PostSchema.pre(
  "deleteMany",
  { document: true, query: false },
  async function (next) {
    await this.model("Comment").deleteMany({ post: this._id });
    next();
  }
);

PostSchema.statics.findByUsername = async function (username, limit) {
  var query = this.find();
  const user = await User.findOne({ userName: username });
  if (user) {
    if (limit === "all") {
      const posts = await query.where({ user: user._id });
      return posts;
    } else {
      const posts = await query
        .where({ user: user._id })
        .sort({ createdAt: -1 })
        .limit(limit);
      return posts;
    }
  }
};
module.exports = mongoose.model("Post", PostSchema);
