const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// ✅ Middleware
app.use(cors()); // Enable CORS
app.use(express.json()); // Parse incoming JSON

// ✅ PostgreSQL connection setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// ✅ Make the pool accessible to route files
app.locals.pool = pool;

// ✅ Mount routes
const productRoutes = require('./routes/products');
app.use('/api/products', productRoutes);


// const depositRoutes = require('./routes/deposits'); // adjust path if needed
// app.use('/api/deposits', depositRoutes); // Mount deposit routes

// ✅ Create Product Route (already exists)
// app.post('/api/products', async (req, res) => {
//   const { name, category, stock, price } = req.body;
//   console.log('🆕 New product being created with data:', req.body);
//   try {
//     const result = await pool.query(
//       `INSERT INTO products 
//         (name, category, stock, price, restock_history, sales_history)
//         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
//       [name, category, stock, price, JSON.stringify([]), JSON.stringify([])]
//     );
//     res.json(result.rows[0]);
//   } catch (err) {
//     console.error('Error adding product:', err);
//     res.status(500).send('Error adding product');
//   }
// });


// Route to record a sale (with database)
// app.post('/api/products/record-sale', async (req, res) => {
//     const { productId, quantity, salesperson } = req.body;
  
//     if (!productId || !quantity || quantity <= 0 || !salesperson) {
//       return res.status(400).json({ error: 'Invalid product ID, quantity, or salesperson' });
//     }
  
//     try {
//       // Fetch product data from the database
//       const result = await pool.query('SELECT * FROM products WHERE id = $1', [productId]);
//       const product = result.rows[0];
  
//       if (!product) {
//         return res.status(404).json({ error: 'Product not found' });
//       }
  
//       if (product.stock < quantity) {
//         return res.status(400).json({ error: 'Not enough stock' });
//       }
  
//       const newStock = product.stock - quantity;
  
//       // Insert sale record
//       const saleQuery = `
//         INSERT INTO sales (product_id, category, quantity, salesperson)
//         VALUES ($1, $2, $3, $4)
//         RETURNING id`;
//       await pool.query(saleQuery, [productId, product.category, quantity, salesperson]);
  
//       // Update product stock
//       const updateStockQuery = `
//         UPDATE products
//         SET stock = $1, last_sale_quantity = $2, last_sale_time = NOW()
//         WHERE id = $3`;
//       await pool.query(updateStockQuery, [newStock, quantity, productId]);
  
//       res.status(200).json({ message: 'Sale recorded successfully' });
//     } catch (error) {
//       console.error('Error recording sale:', error);
//       res.status(500).json({ error: 'Something went wrong' });
//     }
//   });

 // Route to get product details including sales history
// app.get('/api/products/:id', async (req, res) => {
//     const { id } = req.params;
  
//     try {
//       // Get the product and its sales history
//       const productResult = await pool.query(
//         'SELECT * FROM products WHERE id = $1',
//         [id]
//       );
//       const product = productResult.rows[0];
  
//       if (!product) {
//         return res.status(404).json({ error: 'Product not found' });
//       }
  
//       // Optionally fetch detailed sales history from the sales table
//       const salesResult = await pool.query(
//         'SELECT * FROM sales WHERE product_id = $1',
//         [id]
//       );
  
//       const response = {
//         product,
//         sales_history: salesResult.rows, // Detailed sales history
//       };
  
//       res.json(response);
//     } catch (err) {
//       console.error('Error fetching product:', err);
//       res.status(500).json({ error: 'Error fetching product details' });
//     }
//   });
   // Example using PostgreSQL
app.get('/api/products/:productId/sales', async (req, res) => {
    const productId = req.params.productId;
  
    try {
      const result = await pool.query(
        "SELECT id, product_id, quantity, created_at, salesperson FROM sales WHERE product_id = $1 ORDER BY created_at DESC",
        // 'SELECT * FROM sales WHERE product_id = $1 ORDER BY product_id DESC',
        [productId]
      );
      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching sales history:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  

// ✅ Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
