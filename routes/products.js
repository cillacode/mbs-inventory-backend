const express = require('express');
const router = express.Router();
const pool = require('../db');

// 🔐 Login API
router.post('/login', async (req, res) => {
  const { identifier, password } = req.body;

  try {
    const result = await pool.query(
      `SELECT * FROM users WHERE (username = $1 OR email = $1)`,
      [identifier]
    );

    if (result.rows.length === 0 || result.rows[0].password !== password) {
      return res.status(401).json({ message: 'Invalid login credentials' });
    }

    const token = 'your-jwt-token'; // Replace with JWT later
    res.json({ token, user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong' });
  }
});

// 📦 Get all products with latest restock and history
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT 
        p.*,
        rh_latest.quantity AS last_restock_quantity,
        rh_latest.date AS last_restock_date,
        COALESCE(rh_all.history, '[]') AS restock_history
      FROM products p
      LEFT JOIN LATERAL (
        SELECT quantity, date
        FROM restock_history
        WHERE product_id = p.id
        ORDER BY date DESC
        LIMIT 1
      ) rh_latest ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object('quantity', quantity, 'date', date)) AS history
        FROM restock_history
        WHERE product_id = p.id
      ) rh_all ON true
      ORDER BY p.created_at DESC;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});



//adding product 
// router.post('/', async (req, res) => {
//     const { name, category, stock, price } = req.body;
//     const pool = req.app.locals.pool;
  
//     try {
//       const result = await pool.query(
//         `INSERT INTO products 
//           (name, category, stock, price, restock_history, sales_history)
//           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
//         [name, category, stock, price, JSON.stringify([]), JSON.stringify([])]
//       );
//       res.json(result.rows[0]);
//     } catch (err) {
//       console.error('Error adding product:', err);
//       res.status(500).send('Error adding product');
//     }
//   });


//ADDING PRODUCT AND CHECKING
// adding product 
router.post('/', async (req, res) => {
    const { name, category, stock, price } = req.body;
    const pool = req.app.locals.pool;
  
    try {
      // Check for existing product with same name and category
      const existing = await pool.query(
        'SELECT * FROM products WHERE name = $1 AND category = $2',
        [name, category]
      );
  
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Product already exists' });
      }
  
      // Insert new product
      const result = await pool.query(
        `INSERT INTO products 
          (name, category, stock, price, restock_history, sales_history)
          VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [name, category, stock, price, JSON.stringify([]), JSON.stringify([])]
      );
  
      res.json(result.rows[0]);
    } catch (err) {
      console.error('Error adding product:', err);
      res.status(500).send('Error adding product');
    }
  });
  

// ➕ Add stock to product and log restock
router.post('/:id/add-stock', async (req, res) => {
  const productId = req.params.id;
  const { quantity, category } = req.body;

  if (!quantity || isNaN(quantity)) {
    return res.status(400).json({ error: 'Quantity is required and must be a number' });
  }

  try {
    const client = await pool.connect();
    await client.query('BEGIN');

    const updateQuery = `
      UPDATE products
      SET stock = stock + $1 ${category ? ', category = $3' : ''}
      WHERE id = $2
      RETURNING *;
    `;
    const params = category ? [quantity, productId, category] : [quantity, productId];
    const result = await client.query(updateQuery, params);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Product not found' });
    }

    await client.query(
      `INSERT INTO restock_history (product_id, quantity) VALUES ($1, $2);`,
      [productId, quantity]
    );

    // ✅ Fetch updated restock history
    const historyResult = await client.query(
      `SELECT id, product_id, quantity, created_at
       FROM restock_history
       WHERE product_id = $1
       ORDER BY created_at DESC`,
      [productId]
    );

    await client.query('COMMIT');

    // ✅ Combine updated product and new restock history
    const updatedProduct = {
      ...result.rows[0],
      restockHistory: historyResult.rows,
    };

    res.status(200).json({ message: 'Stock added successfully', product: updatedProduct });
  } catch (err) {
    console.error('Error adding stock:', err);
    res.status(500).json({ error: 'Failed to add stock' });
  }
});


// 💲 Update price
router.put('/:id', async (req, res) => {
  const productId = req.params.id;
  const { price } = req.body;

  if (!price || isNaN(price)) {
    return res.status(400).json({ error: 'Price must be a valid number' });
  }

  try {
    const result = await pool.query(
      'UPDATE products SET price = $1 WHERE id = $2 RETURNING *',
      [price, productId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error('Error updating price:', err);
    res.status(500).json({ error: 'Failed to update product price' });
  }
});

// 🛒 Record a product sale
router.post('/record-sale', async (req, res) => {
  const { productId, quantity, category, salesperson } = req.body;

  if (!productId || !quantity || quantity <= 0 || !salesperson) {
    return res.status(400).json({ error: 'Invalid input data' });
  }

  try {
    const productResult = await pool.query('SELECT stock FROM products WHERE id = $1', [productId]);

    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const currentStock = productResult.rows[0].stock;
    const newStock = currentStock - quantity;

    if (newStock < 0) {
      return res.status(400).json({ error: 'Not enough stock' });
    }

    await pool.query(
      `INSERT INTO sales (product_id, category, quantity, salesperson)
       VALUES ($1, $2, $3, $4)`,
      [productId, category, quantity, salesperson]
    );

    await pool.query(
      `UPDATE products
       SET stock = $1, last_sale_quantity = $2, last_sale_time = NOW()
       WHERE id = $3`,
      [newStock, quantity, productId]
    );

    res.status(200).json({ message: 'Sale recorded successfully!' });
  } catch (err) {
    console.error('Error recording sale:', err);
    res.status(500).json({ error: 'Failed to record sale' });
  }
});

// 📄 Get sales history for a product
router.get('/:id/sales-history', async (req, res) => {
  const productId = req.params.id;

  try {
    const result = await pool.query(
      'SELECT * FROM sales WHERE product_id = $1 ORDER BY created_at DESC',
      [productId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'No sales history found' });
    }

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching sales history:', err);
    res.status(500).json({ error: 'Failed to fetch sales history' });
  }
});

// POST: Add new deposit
router.post('/deposits', async (req, res) => {
    const {
      product,
      category,
      quantity,
      amountPaid,
      balanceLeft,
      salesPerson,
      customerName,
      depositDate,
      status,
      deliveryDate
    } = req.body;
  
    try {
      const result = await pool.query(
        `INSERT INTO deposits (
          product, category, quantity, amount_paid, balance_left,
          sales_person, customer_name, deposit_date, status, delivery_date
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [
          product,
          category,
          quantity,
          amountPaid,
          balanceLeft,
          salesPerson,
          customerName,
          depositDate,
          status,
          deliveryDate || null
        ]
      );
  
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('Error inserting deposit:', err);
      res.status(500).send('Server error');
    }
  });
  
  // GET: Fetch all deposits
  router.get('/deposits', async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM deposits ORDER BY deposit_date DESC');
      res.status(200).json(result.rows);
    } catch (err) {
      console.error('Error fetching deposits:', err);
      res.status(500).send('Server error');
    }
  });
  // Express PUT route in routes/deposits.js or wherever your deposit logic is
router.put('/deposits/:id', async (req, res) => {
    const { id } = req.params;
    const { status, deliveryDate } = req.body;
  
    try {
      const result = await pool.query(
        'UPDATE deposits SET status = $1, delivery_date = $2 WHERE id = $3 RETURNING *',
        [status, deliveryDate, id]
      );
  
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Deposit not found' });
      }
  
      res.status(200).json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update deposit status' });
    }
  });
  

module.exports = router;
