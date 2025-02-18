Created the backend project for user, subjects and availabilities"

user create with subject and availability

subject create with availability

each availability of subject could not exceed 8 student

function create read update delete users

function to add subjects, add availabilities

logic to add later each user shuold only be able to have 4 enrolment

Supabase tables:

availabilities
subjects
subject_availabilities
users
user_subjects_availabilities

# Users

# GET
- To retrieve all users
- URL: http://localhost:4000/users


# POST
- To create user
- URL: http://localhost:4000/users
- request.body: {
    "name":"Sam",
    "subject_id":1,
    "availability_id":2
}

# GET
- To search group with optional params 
- URL: http://localhost:4000/group?subject_id=1&availability_id=2
- use different subject_id or availability_id to search group, you can also filter either one only

# DELETE
- To delete one user
- URL: http://localhost:4000/users/:user_id
- use :user_id to delete that user

# Subjects
# POST
-  To create subject
- URL: http://localhost:4000/subjects
- request.body: {
    "name":"Accelerator",
    "description":"Greate place to start with",
    "availability_ids":[1,4,5,6,7]
}

# POST
- To enroll to subjects
- URL: http://localhost:4000/enrolment
- request.body:
    {
    "user_id":"ee46bdd7-5b32-4b14-861f-b60134ea5284",
    "subject_id": 1,
    "availability_id":4
}

## Implemented logic
- maximum 8 students per subject per availability
- user create must have a subject_id and avaiilability_id

## Yet to implement
- logic to limit each student to enrol to 4 class

