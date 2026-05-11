const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

const inputDir = path.join(__dirname, '..', 'input');

function safe(val) {
  return val && val.trim() !== '' ? val.trim() : null;
}

async function insertContent(base) {
  const query = `
    INSERT INTO content_items
    (external_id, title, content, permalink, post_type, published_at, source_file)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    RETURNING id
  `;

  const values = [
    base.external_id,
    base.title,
    base.content,
    base.permalink,
    base.post_type,
    base.published_at,
    base.source_file
  ];

  const res = await client.query(query, values);
  return res.rows[0].id;
}

async function importSalesReps() {
  const file = path.join(inputDir, 'Sales-Rep-2026-clean.csv');
  const csv = fs.readFileSync(file, 'utf-8');

  const data = Papa.parse(csv, { header: true }).data;

  for (const row of data) {
    if (!row.ID) continue;

    await client.query('BEGIN');

    try {
      const contentId = await insertContent({
        external_id: safe(row.ID),
        title: safe(row.Title),
        content: safe(row.Content),
        permalink: safe(row.Permalink),
        post_type: 'sales-rep',
        published_at: safe(row.Date),
        source_file: 'sales-reps'
      });

      await client.query(`
        INSERT INTO sales_reps
        (content_item_id, dealer_locations, categories, email, phone, rep_type)
        VALUES ($1,$2,$3,$4,$5,$6)
      `, [
        contentId,
        safe(row['Dealer Locations']),
        safe(row['Sales Rep Categories']),
        safe(row.Email),
        safe(row.Phone),
        safe(row['Rep Type'])
      ]);

      await client.query('COMMIT');

    } catch (err) {
      await client.query('ROLLBACK');
      console.log('Error SalesRep:', err.message);
    }
  }

  console.log('✅ Sales Reps importados');
}

async function importTraining() {
  const file = path.join(inputDir, 'Training-Program-2026-clean.csv');
  const csv = fs.readFileSync(file, 'utf-8');

  const data = Papa.parse(csv, { header: true }).data;

  for (const row of data) {
    if (!row.ID) continue;

    await client.query('BEGIN');

    try {
      const contentId = await insertContent({
        external_id: safe(row.ID),
        title: safe(row.Title),
        content: safe(row.Content),
        permalink: safe(row.Permalink),
        post_type: 'training',
        published_at: safe(row.Date),
        source_file: 'training'
      });

      await client.query(`
        INSERT INTO training_programs
        (content_item_id, sort_order)
        VALUES ($1,$2)
      `, [
        contentId,
        safe(row['Sort Order'])
      ]);

      await client.query('COMMIT');

    } catch (err) {
      await client.query('ROLLBACK');
      console.log('Error Training:', err.message);
    }
  }

  console.log('✅ Training Programs importados');
}

async function importDealers() {
  const file = path.join(inputDir, 'Dealers-2026-clean.csv');
  const csv = fs.readFileSync(file, 'utf-8');

  const data = Papa.parse(csv, { header: true }).data;

  for (const row of data) {
    if (!row.ID) continue;

    await client.query('BEGIN');

    try {
      const contentId = await insertContent({
        external_id: safe(row.ID),
        title: safe(row.Title),
        content: safe(row.Content),
        permalink: safe(row.Permalink),
        post_type: 'dealer',
        published_at: safe(row.Date),
        source_file: 'dealers'
      });

      await client.query(`
        INSERT INTO dealers
        (content_item_id, dealer_locations, categories, website, phone)
        VALUES ($1,$2,$3,$4,$5)
      `, [
        contentId,
        safe(row['Dealer Locations']),
        safe(row['Dealer Categories']),
        safe(row.Website),
        safe(row.Phone)
      ]);

      await client.query('COMMIT');

    } catch (err) {
      await client.query('ROLLBACK');
      console.log('Error Dealer:', err.message);
    }
  }

  console.log('✅ Dealers importados');
}

async function importProducts() {
  const file = path.join(inputDir, 'Products-2026-clean.csv');
  const csv = fs.readFileSync(file, 'utf-8');

  const data = Papa.parse(csv, {
    header: true,
    skipEmptyLines: true
  }).data;

  for (const row of data) {
    if (!row.ID || !safe(row.Title) || !safe(row.Permalink)) {
      continue;
    }

    await client.query('BEGIN');

    try {
      const contentId = await insertContent({
        external_id: safe(row.ID),
        title: safe(row.Title),
        content: safe(row.Content),
        permalink: safe(row.Permalink),
        post_type: 'product',
        published_at: safe(row.Date),
        source_file: 'products'
      });

      await client.query(`
        INSERT INTO products (
          content_item_id,
          short_description,
          global_unique_id,
          stock_status,
          product_type,
          product_visibility,
          brands,
          product_categories,
          product_tags,
          pos_product_visibility,
          content_hub,
          product_features,
          product_model_groups,
          content_hub_category,
          content_hub_category_parent
        )
        VALUES (
          $1,$2,$3,$4,$5,
          $6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15
        )
      `, [
        contentId,
        safe(row['Short Description']),
        safe(row['Global Unique Id']),
        safe(row['Stock Status']),
        safe(row['Product Type']),
        safe(row['Product Visibility']),
        safe(row['Brands']),
        safe(row['Product categories']),
        safe(row['Product Tags']),
        safe(row['POS Product visibility']),
        safe(row['Content hub']),
        safe(row['Product Features']),
        safe(row['Product Model Groups']),
        safe(row['Content Hub Category']),
        safe(row['Content Hub Category Parent'])
      ]);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.log('Error Product:', err.message);
    }
  }

  console.log('Products imported');
}

async function run() {
  await client.connect();

  // await importSalesReps();
  // await importTraining();
  // await importDealers();
  await importProducts();

  await client.end();
}

run();