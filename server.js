const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const { Decimal128 } = require('mongodb');
const nodemailer = require('nodemailer'); // إضافة nodemailer
const app = express();
const port = 3001;

// إعداد CORS للسماح بالتواصل مع تطبيق Flutter
app.use(cors());

// إعداد Body parser لقراءة البيانات من الطلبات
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// الاتصال بقاعدة بيانات MongoDB
mongoose.connect('mongodb+srv://ahmed:jFRDH2EgcI8AD9m4@cluster0.gcasm.mongodb.net/userDB?retryWrites=true&w=majority')
  .then(() => console.log('Connected to MongoDB'))
  .catch((error) => console.log('Error connecting to MongoDB: ', error));

// إعداد Cloudinary
cloudinary.config({
  cloud_name: 'dpdgpxrl2',
  api_key: '989476428679847',
  api_secret: '0zFd46XHJXcGq_vZoFmutPmbrJ0'
});

// إعداد تخزين الصور باستخدام multer (للتعامل مع الصورة محليًا)
const storage = multer.memoryStorage(); // لتخزين الصورة في الذاكرة مباشرة
const upload = multer({ storage: multer.memoryStorage() }); // تحديد التخزين في الذاكرة

// نموذج المستخدم
const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: { type: String, unique: true },
  password: String,
  profileImage: String, 
  accountType: { type: String, enum: ['Student', 'University'] },
  studentId: String,
  major: String,
  universityName: String,  
  universityCode: String,  
  universityAddress: String,
  studentCount: Number,   
});

// نموذج OTP
const otpSchema = new mongoose.Schema({
  email: { type: String, required: true },
  otp: { type: String, required: true },
  expiresAt: { type: Date, default: Date.now, expires: 300 }, // ينتهي بعد 5 دقائق
});

const User = mongoose.model('User', userSchema);
const OTP = mongoose.model('OTP', otpSchema);

// تعريف نموذج العقار
const PropertySchema = new mongoose.Schema({
  email: { type: String, required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  profileImage: { type: String, required: true },
  ownerId: { type: String, required: true },
  hostelName: { type: String, required: true },
  roomType: { type: String, enum: ['Single', 'Shared'], required: true },
  internetAvailable: { type: Boolean, default: false },
  bathroomType: { type: String, enum: ['Private', 'Shared'], required: true },
  cleaningService: { type: Boolean, default: false },
  maintenanceService: { type: Boolean, default: false },
  securitySystem: { type: Boolean, default: false },
  emergencyMeasures: { type: Boolean, default: false },
  goodLighting: { type: Boolean, default: false },
  sharedAreas: { type: Boolean, default: false },
  studyRooms: { type: Boolean, default: false },
  laundryRoom: { type: Boolean, default: false },
  sharedKitchen: { type: Boolean, default: false },
  foodService: { type: Boolean, default: false },
  effectiveManagement: { type: Boolean, default: false },
  psychologicalSupport: { type: Boolean, default: false },
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  imageUrls: [{ type: String }],
}, { timestamps: true });

const Property = mongoose.model('Property', PropertySchema);

// إعداد nodemailer لإرسال البريد عبر Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'alaeldindev@gmail.com ', // استبدل ببريدك الإلكتروني
    pass: 'ENG:network@88200', // استبدل بكلمة مرور البريد الإلكتروني
  },
});

// وظيفة إرسال OTP عبر Gmail
const sendOTPEmail = async (email, otp) => {
  const mailOptions = {
    from: 'alaeldindev@gmail.com ', // البريد الإلكتروني الخاص بك
    to: email,
    subject: 'Your OTP Code',
    text: `Your OTP code is: ${otp}`,
    html: `<strong>Your OTP code is: ${otp}</strong>`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('OTP email sent successfully');
  } catch (error) {
    console.error('Error sending OTP email:', error);
    throw new Error('Failed to send OTP email');
  }
};

// **إنشاء حساب جديد**
app.post('/register', upload.single('profileImage'), async (req, res) => {
  try {
    const { firstName, lastName, email, password, accountType, studentId, major, universityName, universityCode, universityAddress, studentCount } = req.body;

    // تحقق من صحة البيانات
    if (!firstName || !lastName || !email || !password || !accountType) {
      return res.status(400).json({
        status: 'error',
        message: 'All fields are required.',
      });
    }

    // تحقق من وجود المستخدم
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        status: 'error',
        message: 'Please provide all the necessary details.',
      });
    }

    // تشفير كلمة المرور
    const hashedPassword = await bcrypt.hash(password, 10);

    let profileImageUrl = '';
    if (req.file) {
      // رفع الصورة إلى Cloudinary
      const result = await cloudinary.uploader.upload(req.file.path);
      profileImageUrl = result.secure_url; // الحصول على رابط الصورة من Cloudinary
    }

    // إنشاء مستخدم جديد بناءً على نوع الحساب
    const newUser = new User({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      profileImage: profileImageUrl, 
      accountType, 
      studentId: accountType === 'Student' ? studentId : undefined,
      major: accountType === 'Student' ? major : undefined,
      universityName: accountType === 'University' ? universityName : undefined,
      universityCode: accountType === 'University' ? universityCode : undefined,
      universityAddress: accountType === 'University' ? universityAddress : undefined,
      studentCount: accountType === 'University' ? studentCount : undefined,
    });

    await newUser.save();

    // إنشاء وإرسال OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await sendOTPEmail(email, otp);

    // حفظ OTP في قاعدة البيانات
    const newOTP = new OTP({ email, otp });
    await newOTP.save();

    res.status(201).json({
      status: 'success',
      message: 'Account created successfully. OTP sent to your email.',
      user: {
        id: newUser._id,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        email: newUser.email,
        profileImage: newUser.profileImage,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'An error occurred while creating the account.',
      error: error.message,
    });
  }
});

// **تسجيل الدخول**
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Email and password are required.',
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found. Please check your email or sign up.',
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid password. Please try again.',
      });
    }

    const token = jwt.sign({ id: user._id }, 'your_jwt_secret_key', { expiresIn: '1h' });

    // بناء الاستجابة بناءً على نوع الحساب
    let userData = {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      profileImage: user.profileImage,
    };

    // إذا كان نوع الحساب "Student"
    if (user.accountType === 'Student') {
      userData = {
        ...userData,
        accountType: user.accountType,
        studentId: user.studentId,
        major: user.major,
      };
    }
    // إذا كان نوع الحساب "University"
    else if (user.accountType === 'University') {
      userData = {
        ...userData,
        accountType: user.accountType,
        universityName: user.universityName,
        universityCode: user.universityCode,
        universityAddress: user.universityAddress,
        studentCount: user.studentCount,
      };
    }

    res.status(200).json({
      status: 'success',
      message: 'Login successful!',
      token: token,
      user: userData,  // إرجاع البيانات المناسبة بناءً على نوع الحساب
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'An error occurred while logging in.',
      error: error.message,
    });
  }
});

// **تحديث الملف الشخصي**
app.post('/update-profile', upload.single('profileImage'), async (req, res) => {
  try {
    console.log('Received request to update profile:', req.body); // تتبع البيانات القادمة من العميل
    console.log('File:', req.file); // إذا كانت هناك صورة مرفوعة

    // استخراج البيانات من الـ request body
    const {
      id,
      firstName,
      lastName,
      email,
      phoneNumber,
      gender,
      dob,
      accountType,
      studentId,
      major,
      universityName,
      universityCode,
      universityAddress,
      studentCount
    } = req.body;

    // التحقق من وجود ID المستخدم
    if (!id) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required to update profile.'
      });
    }

    // تجهيز البيانات التي سيتم تحديثها
    let updateData = {};

    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (email) updateData.email = email;
    if (phoneNumber) updateData.phoneNumber = phoneNumber;
    if (gender) updateData.gender = gender;
    if (dob) updateData.dob = dob;
    if (accountType) updateData.accountType = accountType;

    // التحقق من نوع الحساب (Student أو University) وتحديث الحقول المناسبة
    if (accountType === 'Student') {
      if (studentId) updateData.studentId = studentId;
      if (major) updateData.major = major;
    } else if (accountType === 'University') {
      if (universityName) updateData.universityName = universityName;
      if (universityCode) updateData.universityCode = universityCode;
      if (universityAddress) updateData.universityAddress = universityAddress;
      if (studentCount) updateData.studentCount = studentCount;
    }

    // إذا تم رفع صورة جديدة، رفعها إلى Cloudinary
    if (req.file) {
      const buffer = req.file.buffer; // استخراج الـ buffer من الملف

      // رفع الصورة إلى Cloudinary باستخدام Buffer
      const result = await cloudinary.uploader.upload_stream(
        { resource_type: "auto" }, // تحديد نوع المورد (image, video, etc.)
        async (error, result) => {
          if (error) {
            console.error("Error uploading to Cloudinary:", error);
            return res.status(500).json({
              status: 'error',
              message: 'Error uploading image to Cloudinary.',
              error: error.message,
            });
          }

          // إضافة الرابط الآمن للصورة
          updateData.profileImage = result.secure_url;

          // تحديث بيانات المستخدم في قاعدة البيانات
          const updatedUser = await User.findByIdAndUpdate(id, updateData, { new: true });

          if (!updatedUser) {
            return res.status(404).json({
              status: 'error',
              message: 'User not found.'
            });
          }

          res.status(200).json({
            status: 'success',
            message: 'Profile updated successfully!',
            user: updatedUser // إرجاع البيانات المحدثة للمستخدم
          });
        }
      );

      // رفع الصورة مباشرة عبر الـ buffer باستخدام pipe
      buffer && result.end(buffer); // استخدم .end بدلاً من .pipe لأنها طريقة لتمرير الـ buffer مباشرة إلى Cloudinary
    } else {
      // في حالة عدم رفع صورة جديدة، نكمل التحديث دون تعديل الصورة
      const updatedUser = await User.findByIdAndUpdate(id, updateData, { new: true });

      if (!updatedUser) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found.'
        });
      }

      res.status(200).json({
        status: 'success',
        message: 'Profile updated successfully!',
        user: updatedUser
      });
    }

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'An error occurred while updating the profile.',
      error: error.message
    });
  }
});

// نقطة النهاية لاستقبال البيانات
app.post('/addProperty', async (req, res) => {
  console.log('Received request body:', req.body);

  try {
    const {
      email,
      firstName,
      lastName,
      profileImage,
      id: ownerId,
      hostelName,
      roomType,
      internetAvailable,
      bathroomType,
      cleaningService,
      maintenanceService,
      securitySystem,
      emergencyMeasures,
      goodLighting,
      sharedAreas,
      studyRooms,
      laundryRoom,
      sharedKitchen,
      foodService,
      effectiveManagement,
      psychologicalSupport,
      location,
      imageUrls,
    } = req.body;

    // التحقق من وجود روابط الصور (imageUrls)
    if (!imageUrls || imageUrls.length === 0) {
      return res.status(400).json({ error: 'No images provided' });
    }

    // إنشاء عقار جديد
    const newProperty = new Property({
      email,
      firstName,
      lastName,
      profileImage,
      ownerId,
      hostelName,
      roomType,
      internetAvailable,
      bathroomType,
      cleaningService,
      maintenanceService,
      securitySystem,
      emergencyMeasures,
      goodLighting,
      sharedAreas,
      studyRooms,
      laundryRoom,
      sharedKitchen,
      foodService,
      effectiveManagement,
      psychologicalSupport,
      location: {
        lat: location.lat,
        lng: location.lng,
      },
      imageUrls: imageUrls,
    });

    // حفظ العقار في قاعدة البيانات
    const savedProperty = await newProperty.save();

    // إرسال استجابة ناجحة
    res.status(201).json({ message: 'Property added successfully', property: savedProperty });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add property' });
  }
});

// نقطة النهاية لاسترجاع جميع العقارات
app.get('/getAllProperties', async (req, res) => {
  try {
    // جلب جميع العقارات من قاعدة البيانات
    const properties = await Property.find({});

    // تحويل البيانات إلى التنسيق المطلوب
    const formattedProperties = properties.map(property => ({
      _id: property._id,
      type: property.hostelName, // يمكن تعديل هذا الحقل حسب احتياجاتك
      price: property.price || 'N/A', // إذا كان السعر غير موجود، يتم تعيينه إلى 'N/A'
      size: property.size || 'N/A', // إذا كان الحجم غير موجود، يتم تعيينه إلى 'N/A'
      rooms: property.rooms || 0, // إذا كان عدد الغرف غير موجود، يتم تعيينه إلى 0
      imageUrls: property.imageUrls || [], // استخدام أول صورة كصورة رئيسية
      location: {
        lat: property.location.lat,
        lng: property.location.lng,
      },
      ownerId: property.ownerId,
      profileImage: property.profileImage,
      bathroomType: property.bathroomType,
      internetAvailable: property.internetAvailable,
      cleaningService: property.cleaningService,
      maintenanceService: property.maintenanceService,
      securitySystem: property.securitySystem,
      emergencyMeasures: property.emergencyMeasures,
      goodLighting: property.goodLighting,
      sharedAreas: property.sharedAreas,
      studyRooms: property.studyRooms,
      laundryRoom: property.laundryRoom,
      sharedKitchen: property.sharedKitchen,
      foodService: property.foodService,
      effectiveManagement: property.effectiveManagement,
      psychologicalSupport: property.psychologicalSupport,
    }));
      // استخدام JSON.stringify لطباعة البيانات بشكل مفصل
    console.log('Response Data:', JSON.stringify({ properties: formattedProperties }, null, 2));
    // إرسال الاستجابة
    res.status(200).json({ properties: formattedProperties });
  } catch (error) {
    console.error('Error fetching properties:', error);
    res.status(500).json({ error: 'Failed to fetch properties' });
  }
});

// **إرسال OTP**
app.post('/send-otp', async (req, res) => {
  const { email } = req.body;

  try {
    // إنشاء رمز OTP عشوائي
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // إرسال OTP عبر البريد الإلكتروني
    await sendOTPEmail(email, otp);

    // حفظ OTP في قاعدة البيانات
    const newOTP = new OTP({ email, otp });
    await newOTP.save();

    res.status(200).json({ message: 'OTP sent successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to send OTP', error: error.message });
  }
});

// **التحقق من OTP**
app.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  try {
    // البحث عن OTP في قاعدة البيانات
    const savedOTP = await OTP.findOne({ email, otp });
    if (!savedOTP) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    // إذا كان OTP صحيحًا، حذفه من قاعدة البيانات
    await OTP.deleteOne({ email, otp });

    res.status(200).json({ message: 'OTP verified successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to verify OTP', error: error.message });
  }
});

// تشغيل الخادم على المنفذ المحدد
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
