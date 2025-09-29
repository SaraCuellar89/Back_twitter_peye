var express = require('express');
var bodyParser = require('body-parser');
var path = require('path');
var mongoose = require('mongoose');
var session = require('express-session');
var cors = require('cors');
const { verify } = require('crypto');
const { error } = require('console');



//Middlewares
var app = express()
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({extended:true}));
app.use(cors({
  origin: [
    'http://localhost:5500',                 // para pruebas locales
    'https://front-twitter-peye.vercel.app'  // tu frontend en producción
  ],
  credentials: true
}));
app.set('trust proxy', 1); // necesario en Render para que secure funcione

app.use(session({
    secret: '1234',
    resave: false,
    saveUninitialized: false,
    proxy: true, // importante en proxy (Render)
    cookie: {
        secure: process.env.NODE_ENV === 'production', 
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        httpOnly: true
    }
}));
// Middleware para evitar que las páginas protegidas se guarden en caché
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});


//Conexion
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});
const conect = mongoose.connection;
conect.once('open', () => {
    console.log("Conectado a MongoDB")
})
conect.on('error', (error) => {
    console.log("Error de conexion: ", error)
})



//Estructura de las colecciones 
const usuarioShema = new mongoose.Schema({
    nombre: {type: String, required: true, unique: true},
    correo: {type: String, required: true, unique: true},
    contrasena: {type: String, required: true},
    foto: {type: String, default:"https://cdn-icons-png.flaticon.com/512/3106/3106921.png"}
})

const postShema = new mongoose.Schema({
    usuario: {type: mongoose.Schema.Types.ObjectId, ref: "Usuario"},
    titulo: {type: String, required: true},
    imagen: {type: String},
    contenido: {type: String, required:true},
    createdAt: {type: Date, default: Date.now}
})

const comentarioShema = new mongoose.Schema({
    usuario: {type: mongoose.Schema.Types.ObjectId, ref: "Usuario"},
    post: {type: mongoose.Schema.Types.ObjectId, ref: "Post"},
    contenido: {type: String, required:true},
    createdAt: {type: Date, default: Date.now}
})

const likeShema = new mongoose.Schema({
    usuario: {type: mongoose.Schema.Types.ObjectId, ref: "Usuario"},
    post: {type: mongoose.Schema.Types.ObjectId, ref: "Post"},
})


//Mondelos
const Usuario = mongoose.model('Usuario', usuarioShema)
const Post = mongoose.model('Post', postShema)
const Comentario = mongoose.model('Comentarios', comentarioShema)
const Like = mongoose.model('Likes', likeShema)




// ------ Rutas ------

// --- Funcion para veificar inicio de sesion del usuario ---
verificar_inicio_sesion = (req, res, next) => {
    if(req.session && req.session.usuario) {
        req.usuario = req.session.usuario
        next()
    }
    else {
        res.status(401).send('Debes iniciar sesion primero')
    }
}


// --- Registrar usuario ---
app.post('/registrar', async (req, res) => {
    try{

        const {nombre, correo, contrasena, foto} = req.body

        const nuevo_usuario = new Usuario({
            nombre,
            correo,
            contrasena,
            ...(foto ? { foto } : {})
        })

        await nuevo_usuario.save()
        res.status(201).send('Usuario registrado correctamente')
    }
    catch(error){
        console.error(error)
        res.status(500).send("Error: " + error.message)
    }
})

// ----------------- Manejo de la cuenta -----------------

// --- Iniciar Sesion ---
app.post('/iniciar_sesion', async (req, res) => {
    try{
        const {nombre, contrasena} = req.body

        //Buscar si existe el usuario
        const usuario = await Usuario.findOne({nombre})

        if(!usuario){
            return res.status(404).send('Usuario no encontrado')
        }

        if(usuario.contrasena !== contrasena){
            return res.status(401).send("Contraseña incorrecta")
        }

        //Guardas datos de la sesion
        req.session.usuario = {
            id: usuario.id,
            nombre: usuario.nombre, 
            correo: usuario.correo
        }

        res.status(200).send(`Hola ${usuario.nombre}`)
    }
    catch(error){
        console.error(error)
        res.status(500).send("Error: " + error.message)
    }
})


// --- Perfil del usuario ---
app.get('/mi_perfil', verificar_inicio_sesion, async (req, res) => {
    try{
        const usuario = await Usuario.findById(req.session.usuario.id).select('_id nombre correo foto')
        res.json(usuario)
    }
    catch(error){
        console.error(error)
        res.status(500).send("Error: " + error.message)
    }
})


// --- Cerrar Sesion ---
app.post('/cerrar_sesion', verificar_inicio_sesion, async (req, res) => {
    req.session.destroy((err) => {
        if(err){
            console.error(err)
            res.status(500).json({
                success:false,
                message:'Error al cerrar sesion'
            })
        }
        else{
            res.status(201).json({
                success:true,
                message:'Sesion Cerrada'
            })
        }
    })
})


// ----------------- Manejo de los posts -----------------


// --- Listar posts de un usuario especifico ---
app.get('/posts_usuario/:id', verificar_inicio_sesion, async (req, res) => {
    try{
        const usuario_id = req.params.id
        const posts = await Post.find({ usuario: new mongoose.Types.ObjectId(usuario_id) }).sort({ createdAt: -1 })//Convierte un string en objeto
        
        if(!posts || posts.length === 0){
            res.status(404).send('No se encontraron posts')
        }

        return res.json(posts)
    }
    catch(error){
        console.error(error)
        res.status(500).send("Error: " + error.message)
    }
})


// --- Crear posts ---
app.post('/crear_post', verificar_inicio_sesion, async (req, res) => {
    try{
        const { titulo, imagen, contenido} = req.body

        const nuevo_post = new Post({
            usuario: req.session.usuario.id,
            titulo,
            imagen,
            contenido
        })

        await nuevo_post.save()
        res.status(201).send("Post creado correctamente")
    }
    catch(error){
        console.error(error)
        res.status(500).send("Error: " + error.message)
    }
})


// --- Listar posts ---
app.get('/posts', verificar_inicio_sesion, async (req, res) => {
    try{
        //.populate(campoAReferenciar, camposQueQuieroMostrar) => sirve para traer los datos de otra coleccion por medio de la relacion
        const posts = await Post.find().populate('usuario','nombre correo foto').sort({ createdAt: -1 })
        res.json(posts)
    }
    catch(error){
        console.error(error)
        res.status(500).send("Error: " + error.message)
    }
})


// --- Editar posts ---
app.put('/actualizar_post/:id', verificar_inicio_sesion, async (req, res) => {
    try{
        const { titulo, imagen, contenido} = req.body

        const {id} = req.params
        const editar_post = await Post.findByIdAndUpdate(id, {
            titulo, 
            contenido,
            imagen
        }, {new:true})

        if(!editar_post){
            return res.status(404).send("Post no encontrado")
        }
        
        //Mostrar mensaje de extio y mostrar post actualizado
        res.status(201).json({
            message: "Post actualizado correctamente",
            post: editar_post
        })
       
    }
    catch(error){
        console.error(error)
        res.status(500).send("Error: " + error.message)
    }
})


// --- Obtener posts por id ---
app.get('/post_por_id/:id', verificar_inicio_sesion, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id)

        if(!post){
            return res.status(404).send("No se encontró el post")
        } 

        res.json(post)
    } catch (error) {
        res.status(500).send("Error: " + error.message)
    }
})


// --- Eliminar posts ---
app.delete('/eliminar_post/:id', verificar_inicio_sesion, async (req, res) => {
    try{
        const {id} = req.params
        console.log('id: ', id)
        const post_eliminado = await Post.findByIdAndDelete(id)
        
        if(!post_eliminado){
            return res.status(404).send("Post no encontrado")
        }

        await Like.deleteMany({post: id})
        await Comentario.deleteMany({post: id})
        
        res.status(201).send("Post eliminado")
    }
    catch(error){
        console.error(error)
        res.status(500).send("Error: " + error.message)
    }
})


// ----------------- Manejo de los likes -----------------

// --- Dar like ---
app.post('/dar_like/:id', verificar_inicio_sesion, async (req, res) => {
    try{
        const {id} = req.params
        const usuario_id = req.usuario._id

        const existe_like = await Like.findOne({usuario: usuario_id, post: id})

        if(existe_like){
            return res.status(400).json({
                message: "Ta le diste like a este post"
            })
        }

        const like = await Like.create({usuario: usuario_id, post: id})

        res.status(201).json({
            message:"Like agregado",
            like
        })
    }
    catch(error){
        console.error(error)
        res.status(500).send("Error: " + error.message)
    }
})


// --- Listar likes de una pulbicacion ---
app.get('/likes_post/:id', verificar_inicio_sesion, async (req, res) => {
    try{

        const {id} = req.params

        const likes = await Like.find({post: id}).populate("usuario", "nombre correo")

        res.status(200).json({
            total_likes: likes.length,
            likes
        })
    }
    catch(error){
        console.error(error)
        res.status(500).send("Error: " + error.message)
    }
})


// --- Eliminar like ---
app.delete('/eliminar_like/:id', verificar_inicio_sesion, async (req, res) => {
    try{
        const {id} = req.params
        const {usuario_id} = req.body

        const like_eliminado = await Like.findOneAndDelete({usuario: usuario_id, post: id})
        
        if(!like_eliminado){
            return res.status(404).send("No le has dado like")
        }
        else{
            res.status(200).send("Like eliminado")
        }
    }
    catch(error){
        console.error(error)
        res.status(500).send("Error: " + error.message)
    }
})



// ----------------- Manejo de los comentarios -----------------

// --- Crear comentario ---
app.post('/comentar/:id', verificar_inicio_sesion, async (req, res) => {
    try{
        const {id} = req.params
        const {usuario_id, contenido} = req.body

        const comentarios = await Comentario.create({usuario: usuario_id, post: id, contenido: contenido})

        res.status(201).json({
            message:"Comentario creado",
            comentarios
        })
    }
    catch(error){
        console.error(error)
        res.status(500).send("Error: " + error.message)
    }
})


// --- Listar comentarios de una pulbicacion ---
app.get('/comentarios/:id', verificar_inicio_sesion, async (req, res) => {
    try{
        const {id} = req.params

        const comentarios = await Comentario.find({post: id}).populate("usuario", "nombre correo").sort({createdAt: -1})

        res.status(200).json({
            total_comentarios: comentarios.length,
            comentarios
        })
    }
    catch(error){
        console.error(error)
        res.status(500).send("Error: " + error.message)
    }
})


// --- Eliminar comentario ---
app.delete('/eliminar_comentario/:id', verificar_inicio_sesion, async (req, res) => {
    try{
        const {id} = req.params

        const comentario_eliminado = await Comentario.findByIdAndDelete(id)
        
        if(!comentario_eliminado){
            return res.status(404).send("No se econtro el comentario")
        }
        else{
            res.status(200).send("comentario eliminado")
        }
    }
    catch(error){
        console.error(error)
        res.status(500).send("Error: " + error.message)
    }
})



//Escucha del puerto
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor escuchando en puerto ${PORT}`));