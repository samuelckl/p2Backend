import dotenv from "dotenv";
dotenv.config();
import "express-async-errors";
import express from "express";
import cors from "cors";
import { supabase } from "./supabaseClient.js";

import {
  isValidSubjectAvailability,
  fetchUserWithDetails,
  deleteUser,
  isUserEnrolled,
  isEnrollmentFull,
  insertUser,
  enrollUser,
  getExistingUser,
} from "./components/helper.js";

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
        id, name,
        user_subjects_availabilities(
          subject_id, subjects(name),
          availability_id, availabilities(day)
        )
      `);

    const { data, error } = await query;

    if (error) {
      console.error("Supabase Error:", error);
      return res.status(500).json({ error: "Failed to fetch users" });
    }

    if (!data || data.length === 0) {
      return res.status(400).json({ error: "No users in record" });
    }

    console.log("Filtered Users Retrieval:", data);
    res.status(200).json(data);
  } catch (err) {
    console.error("Unexpected Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST create user
app.post("/users", async (req, res) => {
  try {
    console.log(req.body);
    const { name, subject_id, availability_id } = req.body; // Extract subject_id and availability_id, each user should enrol to a subject with 1 availability when create

    // Validate required fields
    if (
      !name ||
      !Number.isInteger(subject_id) ||
      !Number.isInteger(availability_id)
    ) {
      return res.status(400).json({
        error: "Name, subject_id, and availability_id are required.",
      });
    }

    // Validate subject-availability pair, check if in subject_availabilities
    if (!(await isValidSubjectAvailability(subject_id, availability_id))) {
      return res
        .status(400)
        .json({ error: "Invalid subject_id and availability_id combination." });
    }

    // Check if the subject-availability slot is full (Max: 8 students)
    if (await isEnrollmentFull(subject_id, availability_id)) {
      return res.status(400).json({
        error:
          "Subject-availability slot has reached the maximum of 8 students.",
      });
    }

    // Check if user name already exists
    if (await getExistingUser(name)) {
      return res
        .status(400)
        .json({ error: "User with this name already exists." });
    }

    // Insert user
    const user = await insertUser(name);
    const user_id = user.id;

    // Enroll user to user_subjects_availabilities
    try {
      await enrollUser(user_id, subject_id, availability_id);
    } catch (error) {
      console.error("Enrollment Error:", error);
      await deleteUser(user_id); // Rollback if enrollment fails
      return res.status(400).json({ error: error.message });
    }

    const userProfile = await fetchUserWithDetails(user_id);

    console.log("User Created Successfully:", userProfile);
    res.status(201).json(userProfile);
  } catch (err) {
    console.error("Unexpected Error:", err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});

// Add subject
app.post("/subjects", async (req, res) => {
  try {
    console.log(req.body);
    const { name, description, availability_ids } = req.body; // Extract fields

    // Validate required fields
    if (
      !name ||
      !Array.isArray(availability_ids) ||
      availability_ids.length === 0
    ) {
      return res
        .status(400)
        .json({ error: "Name and at least one availability_id are required." });
    }

    // This should be removed if handle in frontend
    if (!availability_ids.every((id) => Number.isInteger(id))) {
      return res
        .status(400)
        .json({ error: "availability_ids must be an array of integers." });
    }

    // Insert subject
    const { data: subjectData, error: subjectError } = await supabase
      .from("subjects")
      .insert({ name, description })
      .select()
      .single();

    if (subjectError) {
      console.error("Supabase Error (Insert Subject):", subjectError);
      return res.status(400).json({ error: "Failed to create subject." });
    }

    const subject_id = subjectData.id; // Get new subject ID

    const subjectAvailabilities = availability_ids.map((availability_id) => ({
      subject_id,
      availability_id,
    }));

    // Insert into subject_availabilities
    const { error: availabilityError } = await supabase
      .from("subject_availabilities")
      .insert(subjectAvailabilities);

    if (availabilityError) {
      console.error(
        "Supabase Error (Insert Subject Availabilities):",
        availabilityError
      );

      // Rollback: Delete the subject if availability insert fails
      const { error: rollbackError } = await supabase
        .from("subjects")
        .delete()
        .eq("id", subject_id);

      if (rollbackError) {
        console.error("Rollback Error:", rollbackError);
        return res.status(500).json({
          error: "Critical error: Subject created but rollback failed.",
        });
      }

      return res
        .status(400)
        .json({ error: "Failed to assign availabilities to subject." });
    }

    // Fetch created subject with availabilities
    const { data: fullSubject, error: fetchError } = await supabase
      .from("subjects")
      .select(
        `
          id, name,description, 
          subject_availabilities!subject_availabilities_subject_id_fkey(*)
        `
      )
      .eq("id", subject_id)
      .single();

    if (fetchError) {
      console.error("Supabase Error (Fetch Subject):", fetchError);
      return res
        .status(400)
        .json({ error: "Failed to fetch subject details." });
    }

    console.log("Subject created with availabilities:", fullSubject);
    res.status(201).json(fullSubject);
  } catch (err) {
    console.error("Unexpected Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST enrolment
app.post("/enrolment", async (req, res) => {
  try {
    console.log(req.body);
    const { user_id, subject_id, availability_id } = req.body;

    // Validate required fields
    if (!user_id || !subject_id || !availability_id) {
      return res.status(400).json({
        error: "user_id, subject_id, and availability_id are required.",
      });
    }

    // Validate subject-availability pair
    if (!(await isValidSubjectAvailability(subject_id, availability_id))) {
      return res
        .status(400)
        .json({ error: "Invalid subject_id and availability_id combination." });
    }

    // Check if the subject-availability slot is full
    if (await isEnrollmentFull(subject_id, availability_id)) {
      return res.status(400).json({
        error:
          "Subject-availability slot has reached the maximum of 8 students.",
      });
    }

    // Check if the user is already enrolled
    if (await isUserEnrolled(user_id, subject_id, availability_id)) {
      return res.status(400).json({
        error:
          "User is already enrolled in this subject with the same availability.",
      });
    }

    // Insert enrollment record
    const { data, error } = await supabase
      .from("user_subjects_availabilities")
      .insert({ user_id, subject_id, availability_id })
      .select();

    if (error) {
      console.error("Supabase Error (Enrollment Insert):", error);
      return res
        .status(400)
        .json({ error: "Failed to enroll user in subject." });
    }

    console.log("Enrolment successful:", data);
    res.status(201).json(data);
  } catch (err) {
    console.error("Unexpected Error:", err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});

// GET group of students in same subject_availability pair
app.get("/group", async (req, res) => {
  try {
    const { subject_id, availability_id } = req.query; // Extract query params

    // Start query
    let query = supabase.from("users").select(`
          name,
          user_subjects_availabilities!inner(
            subject_id, subjects(name),
            availability_id, availabilities(day)
          )
        `);

    // Optional filters
    if (subject_id) {
      query = query.eq("user_subjects_availabilities.subject_id", subject_id);
    }
    if (availability_id) {
      query = query.eq(
        "user_subjects_availabilities.availability_id",
        availability_id
      );
    }

    const { data, error } = await query;

    if (error) {
      console.error("Supabase Error:", error);
      return res.status(500).json({ error: "Failed to fetch users" });
    }

    // Manually filter user with no subjects
    const filteredData = data.filter(
      (user) => user.user_subjects_availabilities.length > 0
    );

    if (!filteredData || filteredData.length === 0) {
      return res
        .status(400)
        .json({ error: "No users found with given filters." });
    }

    // Extract subject names & availability days correctly
    const firstUser = filteredData[0]?.user_subjects_availabilities[0] || {};
    const subjectName = firstUser.subjects?.name || `Subject ID ${subject_id}`;
    const availabilityDay =
      firstUser.availabilities?.day || `Availability ID ${availability_id}`;

    // Extract only the names from the result
    const names = filteredData.map((user) => user.name);

    // Build response message
    let message = "Students ";
    if (subject_id) message += `enrolled in subject: ${subjectName} `;
    if (availability_id) message += `with availability on: ${availabilityDay}`;
    message += ".";

    console.log("Filtered Users Retrieval:", names);
    res.status(200).json({ message, names });
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
