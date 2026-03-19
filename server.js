const express = require("express");
const sql = require("mssql");
const cors = require("cors");

const app = express();

app.use(express.urlencoded({ extended: true }));



app.use(cors({
  origin: [
    'https://candyshop-super-candy.netlify.app',
    'http://localhost:3000'
  ]
}));



app.use(express.json());
app.use('/images', express.static('images'));

const config = {
    server: 'den1.mssql8.gear.host',
    database: 'candyshop',
    user: 'candyshop',
    password: 'Kn4PFj43~?41',
    options: {
        encrypt: false
    }
}

// подключение к базе при запуске сервера
sql.connect(config)
    .then(() => {
        console.log("Connected to SQL Server");
    })
    .catch(err => {
        console.log("Database connection failed:", err);
    });


// ------------------- ПОЛУЧЕНИЕ ТОВАРОВ -------------------

app.get("/products", async (req, res) => {

    try {

        const category = req.query.category;

        if (category) {

            const result = await sql.query`
                SELECT ID_product,
                       Name_product,
                       Description_product,
                       Price_product,
                       image_url,
                       ID_category
                FROM Products
                WHERE ID_category = ${category}
            `;

            res.json(result.recordset);

        } else {

            const result = await sql.query(`
                SELECT ID_product,
                       Name_product,
                       Description_product,
                       Price_product,
                       image_url,
                       ID_category
                FROM Products
            `);

            res.json(result.recordset);

        }

    } catch (err) {

        console.log(err);
        res.status(500).send("Ошибка сервера");

    }

});


app.get("/categories", async (req, res) => {

    try {

        const result = await sql.query(`
SELECT ID_category, Name_category FROM Categories
`);

        res.json(result.recordset);

    } catch (err) {

        console.log(err);
        res.status(500).send("Ошибка сервера");

    }

});

app.get("/productsByCategory", async (req, res) => {

    const categoryId = req.query.category_id;

    try {

        const result = await sql.query(`
            SELECT * FROM Products
            WHERE ID_category = ${categoryId}
        `);

        res.json(result.recordset);

    } catch (err) {

        console.log(err);
        res.status(500).send("Ошибка сервера");

    }

});

// ------------------- ЛОГИН -------------------

app.post("/login", async (req, res) => {

    try {

        const { Email_client, Password_user } = req.body;

        const result = await sql.query`
            SELECT * FROM Clients
            WHERE Email_client = ${Email_client}
            AND Password_user = ${Password_user}
        `;

        if (result.recordset.length > 0) {

            const user = result.recordset[0];

            res.json({
                success: true,
                message: "Login successful",
                userId: user.ID_user
            });

        } else {

            res.json({
                success: false,
                message: "Invalid login"
            });

        }

    } catch (err) {

        console.log(err);
        res.status(500).send("Server error");

    }

});

app.post("/register", async (req,res)=>{

    const {fio,email,password,phone} = req.body;

    try{

        await sql.query`
        INSERT INTO Clients
        (FIO_client, Email_client, Password_user, Phone_client, Role_user)
        VALUES
        (${fio}, ${email}, ${password}, ${phone}, 0)
        `;

        res.json({success:true});

    }
    catch(err){

        console.log(err);
        res.status(500).json({success:false});

    }

});


// ------------------- СОЗДАНИЕ ЗАКАЗА -------------------

app.post("/createOrder", async (req, res) => {

    console.log("Получен заказ:", req.body);

    try {

        const {ID_user, Delivery_address, Comment_order, Delivery_time, items} = req.body;

        
        const orderCountResult = await sql.query`
            SELECT COUNT(*) as orderCount
            FROM Orders
            WHERE ID_user = ${ID_user}
        `;

        let discountId = 1;

        if (orderCountResult.recordset[0].orderCount === 0) {
            discountId = 2;
        }

        
        const order = await sql.query`
        INSERT INTO Orders 
        (ID_user, Status_order, Delivery_address, Comment_order, Delivery_time, Date_order, ID_discount)
        OUTPUT INSERTED.ID_order
        VALUES 
        (${ID_user}, N'Новый', ${Delivery_address}, ${Comment_order}, ${Delivery_time}, GETDATE(), ${discountId})
        `;

        const orderId = order.recordset[0].ID_order;

        
        for (const item of items) {

            await sql.query`
INSERT INTO Order_items
(ID_order, ID_product, Quantity_product, Price_unit)
VALUES
(${orderId}, ${item.id}, ${item.quantity}, ${item.price})
`;
        }

        
        const sumResult = await sql.query`
            SELECT SUM(Sum_position) as total
            FROM Order_items
            WHERE ID_order = ${orderId}
        `;

        let totalSum = sumResult.recordset[0].total;

        
        const discountResult = await sql.query`
            SELECT Discount_percent
            FROM Discount
            WHERE ID_discount = ${discountId}
        `;

        const discountPercent = discountResult.recordset[0].Discount_percent;

        
        const finalSum = totalSum - (totalSum * discountPercent / 100);

        
        await sql.query`
            UPDATE Orders
            SET Order_sum = ${finalSum}
            WHERE ID_order = ${orderId}
        `;

        res.json({
            success: true,
            orderSum: finalSum,
            discountPercent: discountPercent
        });

    } catch (err) {

        console.log(err);
        res.status(500).send("error");

    }

});

// ------------------- Получить заказы пользователя -------------------

app.get("/orders/:userId", async (req, res) => {
    const { userId } = req.params;
    try {
        const result = await sql.query`
            SELECT 
                ID_order,
                Status_order,
                Delivery_address,
                Comment_order,
                FORMAT(Date_order, 'dd.MM.yyyy HH:mm') AS Date_order
            FROM Orders
            WHERE ID_user = ${userId}
            ORDER BY Date_order DESC
        `;
        res.json(result.recordset);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// ------------------- Получить состав заказа (чек) -------------------

app.get("/orderItems/:orderId", async (req, res) => {
    const { orderId } = req.params;
    try {
        const result = await sql.query`
            SELECT 
                p.Name_product,
                oi.Quantity_product AS Quantity,
                p.Price_product
            FROM Order_items oi
            JOIN Products p ON oi.ID_product = p.ID_product
            WHERE oi.ID_order = ${orderId}
        `;
        res.json(result.recordset);
    } catch (err) {
        res.status(500).send(err.message);
    }
});


// ------------------- ЗАПУСК СЕРВЕРА -------------------

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Server started on port", PORT);
});