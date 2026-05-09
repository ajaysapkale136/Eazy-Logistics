require("dotenv").config();
const mongoose = require("mongoose");
const Listing = require("../models/listing");
const detectCategoryAI = require("../utils/categorizer-ai");

async function main() {
  await mongoose.connect(process.env.ATLASDB_URL);
  console.log("DB Connected");

  const cursor = Listing.find({
    $or: [
      { category: { $exists: false } },
      { category: null },
      { category: "" }
    ]
  }).cursor();

  let count = 0;

  for (let listing = await cursor.next(); listing != null; listing = await cursor.next()) {
    const text = `${listing.title} ${listing.description} ${listing.location}`;
    const category = await detectCategoryAI(text);

    listing.category = category;
    await listing.save();

    count++;
    console.log(`Updated ${listing.title} → ${category}`);
  }

  console.log(`Finished updating ${count} listings.`);
  mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
