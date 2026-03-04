import { PrismaClient, UserRole, SalaryType } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database...');

    // Create admin user
    const adminPassword = await bcrypt.hash('admin123', 10);
    const admin = await prisma.user.upsert({
        where: { email: 'admin@example.com' },
        update: {},
        create: {
            email: 'admin@example.com',
            password: adminPassword,
            name: 'Admin User',
            role: UserRole.ADMIN,
            phone: '+1234567890',
            department: 'Management',
            skills: ['Leadership', 'Management', 'Strategy'],
            salaryType: SalaryType.FIXED,
            salaryAmount: 10000,
            joiningDate: new Date('2024-01-01'),
            status: 'ACTIVE',
        },
    });

    console.log('✅ Created admin user:', admin.email);

    // Create developer user
    const devPassword = await bcrypt.hash('dev123', 10);
    const developer = await prisma.user.upsert({
        where: { email: 'developer@example.com' },
        update: {},
        create: {
            email: 'developer@example.com',
            password: devPassword,
            name: 'John Developer',
            role: UserRole.DEVELOPER,
            phone: '+1234567891',
            department: 'Engineering',
            skills: ['React', 'Node.js', 'TypeScript', 'GraphQL'],
            salaryType: SalaryType.HOURLY,
            salaryAmount: 50,
            joiningDate: new Date('2024-01-15'),
            status: 'ACTIVE',
        },
    });

    console.log('✅ Created developer user:', developer.email);

    // Create sales user
    const salesPassword = await bcrypt.hash('sales123', 10);
    const salesRep = await prisma.user.upsert({
        where: { email: 'sales@example.com' },
        update: {},
        create: {
            email: 'sales@example.com',
            password: salesPassword,
            name: 'Jane Sales',
            role: UserRole.SALES,
            phone: '+1234567892',
            department: 'Sales',
            skills: ['Communication', 'Negotiation', 'CRM'],
            salaryType: SalaryType.FIXED,
            salaryAmount: 5000,
            joiningDate: new Date('2024-02-01'),
            status: 'ACTIVE',
        },
    });

    console.log('✅ Created sales user:', salesRep.email);

    console.log('🎉 Database seeded successfully!');
    console.log('\n📝 Login credentials:');
    console.log('Admin: admin@example.com / admin123');
    console.log('Developer: developer@example.com / dev123');
    console.log('Sales: sales@example.com / sales123');
}

main()
    .catch((e) => {
        console.error('❌ Error seeding database:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
