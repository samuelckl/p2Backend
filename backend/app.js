import dotenv from "dotenv";
dotenv.config();
import "express-async-errors";
import express from "express";
import cors from "cors";
import { supabase } from "./supabaseClient.js";


dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// const allowedOrigins = [process.env.FRONTEND_ORIGIN || "http://localhost:3000"];

app.use(
  cors({
    // origin: 'allowedOrigins',
    origin: "*",
    credentials: true,
  })
);

// To get All users details
app.get("/users", async (_, res) => {
  try {
    let query = supabase.from("users").select(`
                *,
                user_subjects(subject_id, subjects(name)),
                user_availabilities(availability_id, availabilities(day))
            `);

    const { data, error } = await query;

    if (error) {
      console.error("Supabase Error:", error);
      return res.status(500).json({ error: "Failed to fetch users" });
    }

    console.log("Filtered Users Retrieval:", data);
    if (data.length === 0) {
      res.status(400).json({ error: "No users in record" });
    }
    res.status(200).json(data);
  } catch (err) {
    console.error("Unexpected Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Adding new user
app.post("/users", async (req, res) => {
  try {
    console.log(req.body);
    const { name, subject_id, availability_id } = req.body; // Extract fields

    // Check required fields for new user
    if (!name || !subject_id || !availability_id) {
      return res
        .status(400)
        .json({ error: "Name, subject_id, and availability_id are required." });
    }

    // Validate fields format
    if (
      !Array.isArray(subject_id) ||
      !subject_id.every((id) => Number.isInteger(id)) ||
      !Array.isArray(availability_id) ||
      !availability_id.every((id) => Number.isInteger(id))
    ) {
      return res
        .status(400)
        .json({
          error: "subject_id and availability_id must be arrays of integers.",
        });
    }

    // Check the subjects count 
    const { data: subjectCounts, error: countError } = await supabase
      .from("user_subjects")
      .select("subject_id", { count: "exact" })
      .in("subject_id", subject_id);

    if (countError) {
      console.error("Supabase Error:", countError);
      return res
        .status(500)
        .json({ error: "Failed to check subject enrolment count" });
    }

    // And see if any exceeds 8 students (constraint), return error if exceeds maximum count
    const SubMaximumCapacity = 8;
    const subjectEnrollment = {};
    subjectCounts.forEach(({ subject_id }) => {
      subjectEnrollment[subject_id] = (subjectEnrollment[subject_id] || 0) + 1;
    });

    if (subject_id.some((id) => (subjectEnrollment[id] || 0) >= SubMaximumCapacity)) {
      return res
        .status(400)
        .json({
          error:
            "One or more subjects have already reached the maximum of 8 students.",
        });
    }

    // Check if name exist (constraint)
    const { data: existingUser, error: nameError } = await supabase
      .from("users")
      .select("id")
      .eq("name", name)
      .maybeSingle(); 

    if (nameError) {
      console.error("Supabase Error (Name Check):", nameError);
      return res.status(500).json({ error: "Failed to check user existence." });
    }

    if (existingUser) {
      return res
        .status(400)
        .json({ error: "User with this name already exists." });
    }

    // Insert User
    const { data: userData, error: userInsertError } = await supabase
      .from("users")
      .insert({name})
      .select()
      .single()

    const user_id = userData.id; // Get the newly created user's ID
    if (userInsertError) {
      console.log("userInsertError", userInsertError);
      return res.status(400).json({ error: "Failed to insert User." });
    }

    // Insert User Subjects
    const subjectRecords = subject_id.map((id) => ({
      user_id,
      subject_id: id,
    }));

    const { error: subjectError } = await supabase
      .from("user_subjects")
      .insert(subjectRecords);

    if (subjectError) {
      console.error("Supabase Error (Subject Insert):", subjectError);
      return res.status(400).json({ error: "Failed to link subjects." });
    }

    // Insert User Availability
    const availabilityRecords = availability_id.map((id) => ({
      user_id,
      availability_id: id,
    }));

    const { error: availabilityError } = await supabase
      .from("user_availabilities")
      .insert(availabilityRecords);

    if (availabilityError) {
      console.error("Supabase Error (Availability Insert):", availabilityError);
      return res.status(400).json({ error: "Failed to link availabilities." });
    }

    // Return created user object with subjects and availabilities
    const { data: fullUser, error: fetchError } = await supabase
      .from("users")
      .select(
        `
                *,
                user_subjects(subject_id),
                user_availabilities(availability_id)
            `
      )
      .eq("id", user_id);

    if (fetchError) {
      console.error("Supabase Error (Fetch User):", fetchError);
      return res.status(400).json({ error: "Failed to fetch user details." });
    }

    console.log("User Created Successfully:", fullUser);
    res.status(201).json(fullUser);
  } catch (err) {
    console.error("Unexpected Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Get all subjects
app.post("/subjects", async (req, res) => {
  try {
    console.log(req.body);
    const { data, error } = await supabase
      .from("subjects")
      .insert(req.body)
      .select();

    if (error) {
      console.error("Supabase Error:", error);
      return res.status(400).json({ error: "Failed to create subject" });
    }

    console.log("Subject created:", data);
    res.status(201).json(data);
  } catch (err) {
    console.error("Unexpected Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Subject Enrolment
app.post("/enrolment", async (req, res) => {
  try {
    console.log(req.body);
    const { subject_id, user_id } = req.body; 

    // Check student count
    const { count, error: countError } = await supabase
      .from("user_subjects")
      .select("*", { count: "exact" })
      .eq("subject_id", subject_id);

    if (countError) {
      console.error("Supabase Error:", countError);
      return res
        .status(500)
        .json({ error: "Failed to check subject enrolment count" });
    }

    if (count >= 8) {
      return res
        .status(400)
        .json({ error: "Subject has already been fulfilled for 8 students." });
    }

    const { data: ifEnrolled, error: enrolledError } = await supabase
      .from("user_subjects")
      .select("*")
      .eq("user_id", user_id);

    if (enrolledError) {
      console.error("Supabase Error:", countError);
      return res
        .status(500)
        .json({ error: "Failed to check if student already enrolled" });
    }

    if (ifEnrolled.some((enrollment) => enrollment.subject_id === subject_id)) {
      console.log("ifEnrolled", ifEnrolled);
      return res
        .status(400)
        .json({
          error: "Subject has already been enrolled by the current student.",
        });
    }

    // Enrol student if class not as much as 8
    const { data, error } = await supabase
      .from("user_subjects")
      .insert(req.body)
      .select();

    if (error) {
      console.error("Supabase Error:", error);
      return res.status(400).json({ error: "Failed to enroll subject" });
    }

    console.log("Enrolment successful:", data);
    res.status(201).json(data);
  } catch (err) {
    console.error("Unexpected Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Insert user availabilities
app.post("/user_availabilities", async (req, res) => {
  try {
    console.log(req.body);
    const { availability_id, user_id } = req.body; // Extract availabity_id [] and user_id

    if (!availability_id || !Array.isArray(availability_id)) {
      return res
        .status(400)
        .json({ error: "Invalid availability_id format. Must be an array." });
    }

    const isValid = availability_id.every(
      (id) => Number.isInteger(id) && id >= 1 && id <= 7
    );

    if (!isValid) {
      return res.status(400).json({
        error: "Invalid availability_id. Must be integers between 1 and 7.",
      });
    }

    // First delete exissting user_availabilities
    const { error: deleteError } = await supabase
      .from("user_availabilities")
      .delete()
      .eq("user_id", user_id);

    if (deleteError) {
      console.error("Supabase Error (Delete):", deleteError);
      return res
        .status(500)
        .json({ error: "Failed to clear previous availabilities." });
    }

    // Mapped and insert all availability of user
    const newAvailabilityRecords = availability_id.map((id) => ({
      user_id: user_id,
      availability_id: id,
    }));

    const { data, error } = await supabase
      .from("user_availabilities")
      .insert(newAvailabilityRecords)
      .select();

    if (error) {
      console.error("Supabase Error (Insert):", error);
      return res
        .status(400)
        .json({ error: "Failed to update availabilities." });
    }

    console.log("User availabilities updated:", data);
    res.status(201).json(data);
  } catch (err) {
    console.error("Unexpected Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Delete user and subjects and availabilities on cascade
app.delete("/users/:id", async (req, res) => {
  try {
    const { id } = req.params; // Extract user ID from URL

    if (!id) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const { data, error } = await supabase
      .from("users")
      .delete()
      .eq("id", id)
      .select();

    if (error) {
      console.error("Supabase Error:", error);
      return res.status(500).json({ error: "Failed to delete user" });
    }

    console.log("User Deleted:", data);
    res
      .status(200)
      .json({ message: "User deleted successfully", deletedUser: data });
  } catch (err) {
    console.error("Unexpected Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
export default app;
