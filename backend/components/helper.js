import { supabase } from "../supabaseClient.js";

// Helper function to check if subject_id and availability_id exist in subject_availabilities
export const isValidSubjectAvailability = async (subject_id, availability_id) => {
  const { data, error } = await supabase
    .from("subject_availabilities")
    .select("subject_id, availability_id")
    .eq("subject_id", subject_id)
    .eq("availability_id", availability_id)
    .maybeSingle();
  if (error) throw new Error("Failed to check subject availabilities.");
  return !!data; // Returns true if exists, false otherwise
};

// Helper function to check if enrollment count exceeds max students per slot
export const isEnrollmentFull = async (
  subject_id,
  availability_id,
  maxStudents = 8
) => {
  const { data, error } = await supabase
    .from("user_subjects_availabilities")
    .select("user_id", { count: "exact" })
    .eq("subject_id", subject_id)
    .eq("availability_id", availability_id);
  if (error) throw new Error("Failed to check subject enrolment count.");
  return data.length >= maxStudents;
};

// Helper function to check if a user is already enrolled in the subject-availability
export const isUserEnrolled = async (user_id, subject_id, availability_id) => {
  const { data, error } = await supabase
    .from("user_subjects_availabilities")
    .select("user_id")
    .eq("user_id", user_id)
    .eq("subject_id", subject_id)
    .eq("availability_id", availability_id)
    .maybeSingle();
  if (error) throw new Error("Failed to check if user is already enrolled.");
  return !!data; // Returns true if enrolled, false otherwise
};

// Check if a user is already in the database
export const getExistingUser = async (name) => {
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("name", name)
    .maybeSingle();

  if (error) throw new Error("Failed to check user existence.");
  return data;
};

// Insert user into the database
export const insertUser = async (name) => {
  const { data, error } = await supabase
    .from("users")
    .insert({ name })
    .select()
    .single();

  if (error) throw new Error("Failed to insert user.");
  return data;
};

// Enroll user in a subject-availability
export const enrollUser = async (user_id, subject_id, availability_id) => {
  const { data, error } = await supabase
    .from("user_subjects_availabilities")
    .insert({ user_id, subject_id, availability_id })
    .select();

  if (error) throw new Error("Failed to enroll user in subjects.");
  return data;
};

// Delete user if enrollment fails (Rollback)
export const deleteUser = async (user_id) => {
  const { error } = await supabase.from("users").delete().eq("id", user_id);
  if (error)
    throw new Error("Critical error: User created but rollback failed.");
};

// Fetch user with subjects and availabilities
export const fetchUserWithDetails = async (user_id) => {
  const { data, error } = await supabase
    .from("users")
    .select(
      `
        id, name,
        user_subjects_availabilities(
          subject_id, subjects(name),
          availability_id, availabilities(day)
        )
      `
    )
    .eq("id", user_id);

  if (error) throw new Error("Failed to fetch user details.");
  return data;
};

