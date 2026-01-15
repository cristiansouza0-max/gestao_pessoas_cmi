// Configurações do Firebase fornecidas por você
const firebaseConfig = {
  apiKey: "AIzaSyCK5O8yrKfhi-PTBBM2nej987I2NL7_3yw",
  authDomain: "mapa-de-folgas.firebaseapp.com",
  projectId: "mapa-de-folgas",
  storageBucket: "mapa-de-folgas.firebasestorage.app",
  messagingSenderId: "548997719274",
  appId: "1:548997719274:web:9281b00884c0acfe0aa393"
};

// Inicialização dos serviços
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();