import bcrypt from "bcrypt";

const createHash = async () => {
  const plainPassword = "Admin@123";

  const hash = await bcrypt.hash(plainPassword, 10);

  console.log("Password:", plainPassword);
  console.log("Hash:", hash);
};

createHash();