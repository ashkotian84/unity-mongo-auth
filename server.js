const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const session = require('express-session');

const app = express();
app.use(express.json()); // Built-in middleware to parse JSON bodies
app.use(cors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        'http://localhost:3000', // React frontend or other UI
        'http://localhost:51238', // Unity WebGL during development
        'http://your-deployed-unity-site.com' // Unity WebGL deployment
      ];
  
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true, // Enable cookies/headers
  }));

app.use(session({
  secret: 'superSecretString2024!@#$', // Replace with your generated secret
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// MongoDB connection (ensure MongoDB is running locally or remotely)
mongoose.connect('mongodb+srv://akotian:Ashkotian@10@unityproject.kyn1n.mongodb.net/?retryWrites=true&w=majority&appName=UnityProject')
    .then(() => {
        console.log('Connected to MongoDB');
    })
    .catch(err => {
        console.log('Failed to connect to MongoDB', err);
    });


// User schema
const userSchema = new mongoose.Schema({
    username: String,
    email: String,
    password: String,
    role: String,
    courseId: String,
    courseName: String, // Teachers will have this
    buildingName: String, // Building name for the class
    classNo: String, // Class number
    time: String // Time of the class
});

const User = mongoose.model('User', userSchema);

const taskSchema = new mongoose.Schema({
  taskName: String,
  taskDescription: String,
  courseId: String,
  createdBy: String,
  createdAt: { type: Date, default: Date.now },
  studentScores: [{
      studentId: String,
      score: Number
  }]
});

const Task = mongoose.model('Task', taskSchema);

// Register Student endpoint (No checking for existing users)
app.post('/registerStudent', async (req, res) => {
    console.log(req.body); // Log the incoming request data

    const { username, email, password, location } = req.body;

    // Hash the password before saving
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
        username,
        email,
        password: hashedPassword,
        role: 'Student',
        location
    });

    try {
        await newUser.save();
        res.json({ message: 'Student registered successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error registering student' });
    }
});

// Register Teacher endpoint (No checking for existing users)
app.post('/registerTeacher', async (req, res) => {
    const { username, email, password, courseId, courseName } = req.body;

    // Hash the password before saving
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
        username,
        email,
        password: hashedPassword,
        role: 'Teacher',
        courseId,
        courseName
    });

    try {
        await newUser.save();
        res.json({ message: 'Teacher registered successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error registering teacher' });
    }
});

// Login endpoint
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ username });
    if (!user) {
        return res.status(400).json({ message: 'Invalid username or password' });
    }

    // Compare the hashed password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
        return res.status(400).json({ message: 'Invalid username or password' });
    }

      req.session.username = user.username;
      req.session.role = user.role;
      console.log("Session data set:", req.session);

    res.json({
      message: 'Login successful',
      role: user.role,
      username: user.username // Ensure this is included in the response
  });
});

app.post('/userDetails', async (req, res) => {
    const { username } = req.body; // Extract the username from the request body
  
    const user = await User.findOne({ username });
    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }
  
    res.json({
        username: user.username,
        location: user.location || 'Unknown',  // Provide a default value if undefined
        playerClass: user.courseId,  // Rename 'class' to 'playerClass' to avoid reserved keyword issue
        role: user.role
    });
  });
  

app.post('/addStudentToClass', async (req, res) => {
  try {
      const { teacherName, studentName } = req.body;

      // Find teacher by username
      const teacher = await User.findOne({ username: teacherName, role: 'Teacher' });
      if (!teacher) {
          return res.status(404).json({ message: 'Teacher not found' });
      }

      // Find the student by username
      const student = await User.findOne({ username: studentName, role: 'Student' });
      if (!student) {
          return res.status(404).json({ message: 'Student not found' });
      }

      // Check if the teacher has an assigned course
      const courseId = teacher.courseId;
      if (!courseId) {
          return res.status(400).json({ message: 'Teacher has no assigned course' });
      }

      // Add the student to the teacher's class by assigning them the courseId
      student.courseId = courseId;

      // Save the student's updated document
      await student.save();

      // Respond back to the client
      res.json({ message: 'Student added to class successfully!', courseId: courseId });
  } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Internal Server Error' });
  }
});


app.post('/createTask', async (req, res) => {
  try {
      const { teacherName, taskName, taskDescription } = req.body;

      // Find the teacher by username
      const teacher = await User.findOne({ username: teacherName, role: 'Teacher' });
      if (!teacher) {
          return res.status(404).json({ message: 'Teacher not found' });
      }

      // Check if the teacher has an assigned course
      const courseId = teacher.courseId;
      if (!courseId) {
          return res.status(400).json({ message: 'Teacher has no assigned course' });
      }

      // Create a new task associated with the course
      const newTask = new Task({
          courseId: courseId,
          taskName: taskName,
          taskDescription: taskDescription,
          createdBy: teacherName
      });

      // Save the task to the database
      await newTask.save();

      // Respond back to the client
      res.json({ message: 'Task created successfully', taskId: newTask._id });
  } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Endpoint to submit a score for a student
app.post('/submitScore', async (req, res) => {
    try {
        const { teacherName, studentName, taskName, score } = req.body;

        // Find the teacher by username
        const teacher = await User.findOne({ username: teacherName, role: 'Teacher' });
        if (!teacher) {
            return res.status(404).json({ message: 'Teacher not found' });
        }

        // Find the student by username
        const student = await User.findOne({ username: studentName, role: 'Student' });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        // Find the task by taskId
        const task = await Task.findOne({ taskName });
        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        // Check if the task belongs to the teacher's course
        if (task.courseId !== teacher.courseId) {
            return res.status(403).json({ message: 'You are not authorized to score this task' });
        }

        // Check if the student has already been scored for this task
        let studentScore = task.studentScores.find(s => s.studentId === student._id.toString());

        if (studentScore) {
            // Update existing score
            studentScore.score = score;
        } else {
            // Add a new score for the student
            task.studentScores.push({
                studentId: student._id.toString(),
                score: score
            });
        }

        // Save the task with the updated score
        await task.save();

        // Respond back to the client
        res.json({ message: 'Score submitted successfully!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

app.get('/leaderboard', async (req, res) => {
    try {
        // Fetch all tasks and aggregate scores
        const tasks = await Task.find();

        // Create a map to aggregate scores by student ID
        const scoreMap = {};

        tasks.forEach(task => {
            task.studentScores.forEach(scoreEntry => {
                if (scoreMap[scoreEntry.studentId]) {
                    scoreMap[scoreEntry.studentId] += scoreEntry.score; // Sum scores for each student
                } else {
                    scoreMap[scoreEntry.studentId] = scoreEntry.score; // Initialize score for the student
                }
            });
        });

        // Convert the score map to an array for sorting
        let leaderboard = Object.entries(scoreMap).map(([studentId, score]) => ({
            studentId,
            score
        }));

        // Fetch student names from the database using student IDs
        for (let i = 0; i < leaderboard.length; i++) {
            const student = await User.findById(leaderboard[i].studentId);
            leaderboard[i].username = student ? student.username : "Unknown";
        }

        // Sort the leaderboard by score in descending order
        leaderboard.sort((a, b) => b.score - a.score);

        // Wrap leaderboard in an object with a key `items`
        res.status(200).json({ items: leaderboard });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching leaderboard data', error });
    }
});

app.get('/enrolledStudents/:username', async (req, res) => {
    try {
        const { username } = req.params;

        // Find the current student by username
        const currentStudent = await User.findOne({ username, role: 'Student' });
        if (!currentStudent) {
            return res.status(404).json({ message: 'Student not found' });
        }

        // Find all students enrolled in the same course
        const courseId = currentStudent.courseId;
        if (!courseId) {
            return res.status(400).json({ message: 'The student is not enrolled in any course' });
        }

        // Get all students in the same course
        const students = await User.find({ courseId: courseId, role: 'Student' });

        // Respond with the list of students including course name
        const enrolledStudents = students.map(student => ({
            username: student.username,
            courseName: currentStudent.courseName // Using the same course name for all enrolled students
        }));

        res.status(200).json({ items: enrolledStudents });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching enrolled students', error });
    }
});

app.get('/enrolledStudents/:username', async (req, res) => {
    try {
        const { username } = req.params;

        // Find the current user by username
        const currentUser = await User.findOne({ username });
        if (!currentUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        let students;
        const courseId = currentUser.courseId;

        if (!courseId) {
            return res.status(400).json({ message: 'User is not enrolled in or assigned to any course' });
        }

        // Fetch students based on the user's role
        students = await User.find({ courseId: courseId, role: 'Student' });

        // Prepare response data including username and courseId
        const enrolledStudents = students.map(student => ({
            username: student.username,
            courseId: student.courseId || "N/A" // Include courseId, if available
        }));

        return res.status(200).json({ items: enrolledStudents });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching enrolled students', error });
    }
});

app.get('/tasks/:username', async (req, res) => {
    try {
        const { username } = req.params;

        // Find the current user by username and role
        const currentUser = await User.findOne({ username });
        if (!currentUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        const courseId = currentUser.courseId;
        if (!courseId) {
            return res.status(400).json({ message: 'User is not enrolled in or assigned to any course' });
        }

        // Find all tasks related to the course
        const tasks = await Task.find({ courseId });

        let userTasks;

        // If the current user is a student, filter the tasks by their scores
        if (currentUser.role === 'Student') {
            userTasks = tasks.map(task => {
                const studentScore = task.studentScores.find(score => score.studentId === currentUser._id.toString());
                return {
                    taskName: task.taskName,
                    courseId: task.courseId,
                    score: studentScore ? studentScore.score : "No score assigned"
                };
            });
        } 
        // If the user is a teacher, return tasks without filtering
        else if (currentUser.role === 'Teacher') {
            userTasks = tasks.map(task => ({
                taskName: task.taskName,
                courseId: task.courseId,
                totalScores: task.studentScores.length // Optionally include the number of student scores
            }));
        } else {
            return res.status(400).json({ message: 'Invalid user role' });
        }

        res.status(200).json({ items: userTasks });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching task data', error });
    }
});


// Endpoint to fetch timetable details for a student or teacher
app.get('/timetable/:username', async (req, res) => {
    try {
        const { username } = req.params;

        // Find the user (could be a student or a teacher)
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        let timetable = null;

        if (user.role === 'Student') {
            // For students, find the course they are enrolled in
            const courseId = user.courseId;
            if (!courseId) {
                return res.status(400).json({ message: 'The student is not enrolled in any course' });
            }

            // Fetch the course details from the teacher based on the courseId
            const teacher = await User.findOne({ courseId: courseId, role: 'Teacher' });
            if (!teacher) {
                return res.status(404).json({ message: 'Course details not found for this courseId' });
            }

            // Prepare timetable for the student based on the teacher's course information
            timetable = {
                courseId: teacher.courseId,
                courseName: teacher.courseName,
                buildingName: teacher.buildingName,
                classNo: teacher.classNo,
                time: teacher.time
            };
        } else if (user.role === 'Teacher') {
            // For teachers, use their own course details
            const courseId = user.courseId;
            if (!courseId) {
                return res.status(400).json({ message: 'The teacher has no assigned course' });
            }

            // Prepare timetable for the teacher based on their course details
            timetable = {
                courseId: user.courseId,
                courseName: user.courseName,
                buildingName: user.buildingName,
                classNo: user.classNo,
                time: user.time
            };
        } else {
            return res.status(400).json({ message: 'Invalid role. Must be either Student or Teacher' });
        }

        // Return the timetable data
        res.status(200).json({ timetable });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching timetable data', error });
    }
});


// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
