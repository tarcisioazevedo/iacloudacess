import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('admin123', 12);
  
  const result = await prisma.profile.updateMany({
    where: {
      email: {
        in: [
          'admin@plataforma.com',
          'integrador@techseg.com',
          'diretor@colegio.com',
          'coord@colegio.com',
          'portaria@colegio.com'
        ]
      }
    },
    data: {
      passwordHash: hash
    }
  });
  
  console.log(`Atualizou com sucesso ${result.count} perfis locais com a senha admin123.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
