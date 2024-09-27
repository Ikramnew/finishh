const express = require("express");
const path = require("path");
const bcrypt = require('bcryptjs');
const multer = require('multer');
const session = require('express-session');
const { createClient } = require("@supabase/supabase-js");
const hbs = require("hbs");
const app = express();
const PORT = process.env.PORT || 5000;
require('dotenv').config();
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const cloudinary = require('cloudinary').v2;
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
const saltRounds = 10;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});
hbs.registerHelper('formatDate', function(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toISOString().split('T')[0]; // Format as YYYY-MM-DD
});
hbs.registerHelper('includes', function(array, value) {
    return array && array.includes(value);
  });
  

// Set up view engine and static files
app.set("view engine", "hbs");
app.set("views", path.join(__dirname, "./views"));
app.use("/assets", express.static(path.join(__dirname, "./assets")));
app.use(express.urlencoded({ extended: true }));

// Initialize multer to handle file uploads
const storage = multer.memoryStorage(); 
const upload = multer({ storage: storage });

// Session management
app.use(session({
    secret: process.env.SESSION_SECRET || 'default_secret',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));
// Routes
app.get("/", home);
app.get("/contact", contact);
app.get("/testimonial", testimonial);
app.get("/addproject", project);
app.get("/project", projectShow);
app.get("/delete-project/:id", projectDelete);
app.get("/edit-project/:id", projectEditView);
app.post("/edit-project/:id", upload.single('image'), projectEdit);
app.get("/detail-project/:id", projectDetail);
app.post("/project", upload.single('image'), postProject);
app.get("/login", loginView);
app.get("/register", registerView);
app.post("/register", register);
app.post("/login", login);
app.get("/logout", logout);

// Register user with Supabase
async function register(req, res) {
    const { name, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const { data, error } = await db
            .from('users')
            .insert([{ name, email, password: hashedPassword }]);

        if (error) {
            throw error;
        }
        res.redirect('/login');
    } catch (error) {
        console.error("Error registering user:", error);
        res.status(500).send("Error registering user");
    }
}

// Login user
async function login(req, res) {
    const { email, password } = req.body;
    try {
        const { data: users, error } = await db
            .from('users')
            .select('*')
            .eq('email', email)
            .limit(1);

        if (error || users.length === 0) {
            req.session.errorMessage = 'User not found';
            return res.redirect('/login');
        }

        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            req.session.errorMessage = 'Incorrect password';
            return res.redirect('/login');
        }

        req.session.user = { id: user.id, email: user.email, name: user.name };
        req.session.successMessage = 'Login successful!';
        res.redirect('/');
    } catch (error) {
        console.error("Error logging in user:", error);
        req.session.errorMessage = 'Error logging in user';
        res.redirect('/login');
    }
}

// Logout user
function logout(req, res) {
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/');
        }
        res.redirect('/login');
    });
}

// Show projects
async function projectShow(req, res) {
    try {
        const { data: projects, error } = await db
            .from('project')
            .select('*, users (name)')
            .order('createdAt', { ascending: false });
        if (error) {
            throw error;
        }

        const user = req.session.user;
        const successMessage = req.session.successMessage || null;
        req.session.successMessage = null;

        res.render("project", { projects, user, successMessage });
    } catch (error) {
        console.error("Error fetching projects:", error);
        res.status(500).send("Error fetching projects");
    }
}

// Project details
async function projectDetail(req, res) {
    const { id } = req.params;
    try {
        const { data: project, error } = await db
            .from('project')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !project) {
            return res.status(404).send("Project not found");
        }

        const user = req.session.user;
        res.render("detailProject", { project, user });
    } catch (error) {
        console.error("Error fetching project details:", error);
        res.status(500).send("Error fetching project details");
    }
}

// Delete project
async function projectDelete(req, res) {
    const { id } = req.params;
    try {
        const { error } = await db
            .from('project')
            .delete()
            .eq('id', id);

        if (error) {
            throw error;
        }

        req.session.successMessage = "Project deleted successfully!";
        res.redirect("/project");
    } catch (error) {
        console.error("Error deleting project:", error);
        res.status(500).send("Error deleting project");
    }
}

// Edit project view
async function projectEditView(req, res) {
    const { id } = req.params;
    try {
        const { data: project, error } = await db
            .from('project')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !project) {
            return res.status(404).send("Project not found");
        }

        res.render("editproject", { project });
    } catch (error) {
        console.error("Error fetching project for edit view:", error);
        res.status(500).send("Error fetching project for edit view");
    }
}

async function projectEdit(req, res) {
    const formattedTechnologies = `{${technologies.join(',')}}`;
    const { id } = req.params;
    const { project_name, description, start_date, end_date, technologies = [] } = req.body;

    try {
        const image = req.file ? await uploadFileToCloudinary(req.file) : req.body.existingImage;

        const { error } = await db
            .from('project')
            .update({
                project_name,
                description,
                start_date: new Date(start_date),
                end_date: new Date(end_date),
                technologies:formattedTechnologies,
                image
            })
            .eq('id', id);

        if (error) {
            throw error;
        }

        req.session.successMessage = "Project updated successfully!";
        res.redirect("/project");
    } catch (error) {
        console.error("Error updating project:", error);
        req.session.errorMessage = 'Error updating project, please try again.';
        res.redirect("/edit-project/" + id); // Redirect to edit page with error message
    }
}


// Upload file to Cloudinary
async function uploadFileToCloudinary(file) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { resource_type: 'auto' },
            (error, result) => {
                if (error) {
                    return reject(new Error("Cloudinary upload failed: " + error.message));
                }
                resolve(result.secure_url);
            }
        );
        stream.end(file.buffer); // Menggunakan buffer untuk upload
    });
}

// Add project with file upload
async function postProject(req, res) {
    const { project_name, start_date, end_date, description, technologies = [] } = req.body;
    const userId = req.session.user.id;
    const user = req.session.user;
    const formattedTechnologies = `{${technologies.join(',')}}`;
    try {
        const imageUrl = req.file ? await uploadFileToCloudinary(req.file) : 'https://default.image.url'; // Ganti dengan URL gambar default

        const { error } = await db
            .from('project')
            .insert({
                project_name,
                start_date: new Date(start_date),
                end_date: new Date(end_date),
                description,
                technologies:formattedTechnologies,
                image: imageUrl,
                userid: userId,
            });

        if (error) {
            throw error;
        }

        req.session.successMessage = "Project added successfully!";
        res.redirect("/project");
    } catch (error) {
        console.error("Error adding project:", error);
        res.status(500).send("Error adding project");
    }
}

// Contact page
function contact(req, res) {
    const user = req.session.user;
    res.render("contact", { user });
}

// Home page
function home(req, res) {
    const user = req.session.user;
    const errorMessage = req.session.errorMessage || null;
    req.session.errorMessage = null;

    res.render("index", { user, errorMessage });
}

// Testimonial page
function testimonial(req, res) {
    const user = req.session.user;
    res.render("testimonial", { user });
}

// Project page
function project(req, res) {
    const user = req.session.user;
    res.render("addproject", { user });
}

// Login view
function loginView(req, res) {
    const errorMessage = req.session.errorMessage || null;
    req.session.errorMessage = null;
    res.render("login", { errorMessage });
}

// Register view
function registerView(req, res) {
    res.render("register");
}

// Start server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
