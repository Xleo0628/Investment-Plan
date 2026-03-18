const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = express();

// 配置（关键修改：替换为你的MongoDB连接地址）
app.use(cors());
app.use(express.json());
const JWT_SECRET = 'dividend-strategy-2024-free-version-123'; // 无需修改，个人使用足够安全
const MONGODB_URI = '替换为你第一步复制的MongoDB连接地址'; // 重点：替换这里！
const PORT = process.env.PORT || 3001;

// 连接MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB连接成功'))
  .catch(err => console.error('MongoDB连接失败:', err));

// 1. 用户模型（仅单账户）
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

// 2. 基础参数模型
const BasicParamsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  monthly: { type: Number, default: 50000 },
  period: { type: Number, default: 36 },
  maxRemain: { type: Number, default: 50000 },
  coreThreshold: { type: Number, default: 90 },
  qualifyThreshold: { type: Number, default: 80 },
  targets: { type: Array, default: [
    { category: '银行类', name: '工商银行', code: '601398', totalFund: 24, targetDiv: 5.00 },
    { category: '银行类', name: '兴业银行', code: '601166', totalFund: 24, targetDiv: 5.00 },
    { category: '公用/交运类', name: '长江电力', code: '600900', totalFund: 24, targetDiv: 4.00 },
    { category: '公用/交运类', name: '大秦铁路', code: '601006', totalFund: 12, targetDiv: 5.00 },
    { category: '能源周期类', name: '中国神华', code: '601088', totalFund: 24, targetDiv: 5.50 },
    { category: '能源周期类', name: '中国石化', code: '600028', totalFund: 12, targetDiv: 5.00 },
    { category: '红利ETF类', name: '红利低波ETF易方达', code: '563020', totalFund: 30, targetDiv: 4.50 },
    { category: '红利ETF类', name: '红利ETF易方达', code: '515180', totalFund: 30, targetDiv: 5.00 }
  ]},
  updatedAt: { type: Date, default: Date.now }
});

// 3. 当月录入数据模型
const InputDataSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lastRemain: { type: Number, default: 0 },
  executedMonths: { type: Number, default: 0 },
  inputData: { type: Array, default: [] },
  updatedAt: { type: Date, default: Date.now }
});

// 4. 历史记录模型
const HistorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },
  period: { type: String, required: true },
  name: { type: String, required: true },
  code: { type: String, required: true },
  buy: { type: Number, required: true },
  invested: { type: Number, required: true },
  remain: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});

// 创建模型
const User = mongoose.model('User', UserSchema);
const BasicParams = mongoose.model('BasicParams', BasicParamsSchema);
const InputData = mongoose.model('InputData', InputDataSchema);
const History = mongoose.model('History', HistorySchema);

// ========== 接口定义 ==========
// 1. 初始化管理员账户（仅首次运行需要，运行后无需管）
app.get('/init-admin', async (req, res) => {
  try {
    const hashedPwd = await bcrypt.hash('admin123', 10);
    const user = new User({
      username: 'admin',
      password: hashedPwd
    });
    await user.save();
    await new BasicParams({ userId: user._id }).save();
    await new InputData({ userId: user._id }).save();
    res.json({ success: true, message: '管理员账户创建成功！账号：admin，密码：admin123' });
  } catch (err) {
    res.json({ success: false, message: '账户已存在，无需重复创建：' + err.message });
  }
});

// 2. 用户登录
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.json({ success: false, message: '用户不存在' });
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.json({ success: false, message: '密码错误' });
    
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      success: true,
      token,
      userId: user._id,
      username
    });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// 3. 验证token中间件
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.json({ success: false, message: '未登录' });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    res.json({ success: false, message: 'token失效' });
  }
};

// 4. 基础参数接口（增删改查）
app.get('/basic-params', auth, async (req, res) => {
  try {
    let params = await BasicParams.findOne({ userId: req.userId });
    if (!params) params = await new BasicParams({ userId: req.userId }).save();
    res.json({ success: true, data: params });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.post('/basic-params', auth, async (req, res) => {
  try {
    const data = req.body;
    await BasicParams.findOneAndUpdate(
      { userId: req.userId },
      { ...data, updatedAt: Date.now() },
      { upsert: true }
    );
    res.json({ success: true, message: '基础参数保存成功' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// 5. 录入数据接口
app.get('/input-data', auth, async (req, res) => {
  try {
    let data = await InputData.findOne({ userId: req.userId });
    if (!data) data = await new InputData({ userId: req.userId }).save();
    res.json({ success: true, data });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.post('/input-data', auth, async (req, res) => {
  try {
    const data = req.body;
    await InputData.findOneAndUpdate(
      { userId: req.userId },
      { ...data, updatedAt: Date.now() },
      { upsert: true }
    );
    res.json({ success: true, message: '录入数据保存成功' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// 6. 历史记录接口
app.get('/history', auth, async (req, res) => {
  try {
    const history = await History.find({ userId: req.userId }).sort({ createdAt: -1 });
    res.json({ success: true, data: history });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.post('/history', auth, async (req, res) => {
  try {
    const records = req.body;
    const historyRecords = records.map(record => ({
      ...record,
      userId: req.userId
    }));
    await History.insertMany(historyRecords);
    res.json({ success: true, message: '历史记录保存成功' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.delete('/history/:id', auth, async (req, res) => {
  try {
    await History.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: '记录删除成功' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.delete('/history', auth, async (req, res) => {
  try {
    await History.deleteMany({ userId: req.userId });
    res.json({ success: true, message: '历史记录已清空' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// 启动服务
app.listen(PORT, () => {
  console.log(`后端服务运行在 http://localhost:${PORT}`);
});
