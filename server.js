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
                userId: user.ID_user,
                role: user.Role_user === 1 ? 'admin' : 'user'
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
                Order_sum,
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


// ── ADMIN: все заказы ──
app.get("/admin/orders", async (req, res) => {
    try {
        const result = await sql.query`
            SELECT o.ID_order, o.Status_order, o.Delivery_address,
                   o.Comment_order, o.Order_sum,
                   o.Delivery_time, o.Reject_reason,
                   FORMAT(o.Date_order, 'dd.MM.yyyy HH:mm') AS Date_order,
                   c.FIO_client, c.Phone_client, c.Email_client
            FROM Orders o
            JOIN Clients c ON o.ID_user = c.ID_user
            ORDER BY o.Date_order DESC
        `;
        res.json(result.recordset);
    } catch (err) { res.status(500).send("Ошибка сервера"); }
});

// ── ADMIN: одобрить заказ ──
app.post("/admin/approve/:id", async (req, res) => {
    const { id } = req.params;
    try {
        await sql.query`UPDATE Orders SET Status_order = N'Готовится' WHERE ID_order = ${id}`;
        res.json({ success: true });
    } catch (err) { res.status(500).send("Ошибка сервера"); }
});

// ── ADMIN: отклонить заказ ──
app.post("/admin/reject/:id", async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    try {
        await sql.query`UPDATE Orders SET Status_order = N'Отменён', Reject_reason = ${reason} WHERE ID_order = ${id}`;
        res.json({ success: true });
    } catch (err) { res.status(500).send("Ошибка сервера"); }
});

// ── ADMIN: добавить товар ──
app.post("/admin/products", async (req, res) => {
    const { name, description, price, category_id, image_url, unit_id } = req.body;
    try {
        await sql.query`INSERT INTO Products (Name_product, Description_product, Price_product, ID_category, image_url, ID_unit) VALUES (${name}, ${description}, ${price}, ${category_id}, ${image_url}, ${unit_id})`;
        res.json({ success: true });
    } catch (err) {
        console.log(err);
        res.status(500).send("Ошибка сервера");
    }
});

// ── ADMIN: редактировать товар ──
app.put("/admin/products/:id", async (req, res) => {
    const { id } = req.params;
    const { name, description, price, category_id, image_url, unit_id } = req.body;
    try {
        await sql.query`UPDATE Products SET Name_product = ${name}, Description_product = ${description}, Price_product = ${price}, ID_category = ${category_id}, image_url = ${image_url}, ID_unit = ${unit_id} WHERE ID_product = ${id}`;
        res.json({ success: true });
    } catch (err) {
        console.log(err);
        res.status(500).send("Ошибка сервера");
    }
});

// ── ADMIN: удалить товар ──
app.delete("/admin/products/:id", async (req, res) => {
    const { id } = req.params;
    try {
        await sql.query`DELETE FROM Products WHERE ID_product = ${id}`;
        res.json({ success: true });
    } catch (err) { res.status(500).send("Ошибка сервера"); }
});


// ── ОТЧЁТ В-01: Заказ по номеру ──
app.get("/report/order/:id", async (req, res) => {
    const { id } = req.params;
    try {
        const order = await sql.query`
            SELECT o.ID_order, o.Status_order, o.Delivery_address,
                   o.Comment_order, o.Delivery_time, o.Order_sum,
                   FORMAT(o.Date_order, 'dd.MM.yyyy') AS Date_order,
                   c.FIO_client, c.Email_client, c.Phone_client,
                   d.Discount_percent
            FROM Orders o
            JOIN Clients c ON o.ID_user = c.ID_user
            JOIN Discount d ON o.ID_discount = d.ID_discount
            WHERE o.ID_order = ${id}`;
        const items = await sql.query`
            SELECT p.Name_product,
                   cat.Name_category,
                   u.Short_unit AS Unit,
                   p.Price_product,
                   oi.Quantity_product,
                   oi.Sum_position
            FROM Order_items oi
            JOIN Products p ON oi.ID_product = p.ID_product
            JOIN Categories cat ON p.ID_category = cat.ID_category
            JOIN Units u ON p.ID_unit = u.ID_unit
            WHERE oi.ID_order = ${id}`;
        if (!order.recordset.length) return res.status(404).json({ error: 'Заказ не найден' });
        res.json({ order: order.recordset[0], items: items.recordset });
    } catch (err) { console.log(err); res.status(500).send("Ошибка сервера"); }
});

// ── ОТЧЁТ В-02: По проданным изделиям за период ──
app.get("/report/products", async (req, res) => {
    const { date_start, date_end } = req.query;
    try {
        const result = await sql.query`
            SELECT p.Name_product,
                   cat.Name_category,
                   u.Short_unit AS Unit,
                   SUM(oi.Quantity_product) AS Quantity,
                   p.Price_product,
                   SUM(oi.Sum_position) AS Total
            FROM Order_items oi
            JOIN Products p ON oi.ID_product = p.ID_product
            JOIN Categories cat ON p.ID_category = cat.ID_category
            JOIN Units u ON p.ID_unit = u.ID_unit
            JOIN Orders o ON oi.ID_order = o.ID_order
            WHERE CAST(o.Date_order AS DATE) BETWEEN ${date_start} AND ${date_end}
            GROUP BY p.Name_product, cat.Name_category, u.Short_unit, p.Price_product
            ORDER BY p.Name_product`;
        res.json(result.recordset);
    } catch (err) { console.log(err); res.status(500).send("Ошибка сервера"); }
});

// ── ОТЧЁТ В-03: По выданным заказам за период ──
app.get("/report/orders", async (req, res) => {
    const { date_start, date_end } = req.query;
    try {
        const result = await sql.query`
            SELECT o.ID_order,
                   FORMAT(o.Date_order, 'dd.MM.yyyy') AS Date_order,
                   c.FIO_client, c.Phone_client,
                   o.Comment_order, o.Order_sum
            FROM Orders o
            JOIN Clients c ON o.ID_user = c.ID_user
            WHERE CAST(o.Date_order AS DATE) BETWEEN ${date_start} AND ${date_end}
            ORDER BY o.Date_order`;
        res.json(result.recordset);
    } catch (err) { console.log(err); res.status(500).send("Ошибка сервера"); }
});

// ── ОТЧЁТ В-04: По продажам по категории за период ──
app.get("/report/category", async (req, res) => {
    const { date_start, date_end, category_id } = req.query;
    try {
        const result = await sql.query`
            SELECT p.Name_product,
                   u.Short_unit AS Unit,
                   SUM(oi.Quantity_product) AS Quantity,
                   p.Price_product,
                   SUM(oi.Sum_position) AS Total
            FROM Order_items oi
            JOIN Products p ON oi.ID_product = p.ID_product
            JOIN Units u ON p.ID_unit = u.ID_unit
            JOIN Orders o ON oi.ID_order = o.ID_order
            WHERE CAST(o.Date_order AS DATE) BETWEEN ${date_start} AND ${date_end}
            AND p.ID_category = ${category_id}
            GROUP BY p.Name_product, u.Short_unit, p.Price_product
            ORDER BY p.Name_product`;
        res.json(result.recordset);
    } catch (err) { console.log(err); res.status(500).send("Ошибка сервера"); }
});

// ── ОТЧЁТ В-05: Список заказов клиента по ФИО ──
app.get("/report/client", async (req, res) => {
    const { fio } = req.query;
    try {
        const result = await sql.query`
            SELECT o.ID_order,
                   FORMAT(o.Date_order, 'dd.MM.yyyy') AS Date_order,
                   o.Status_order, o.Comment_order, o.Order_sum
            FROM Orders o
            JOIN Clients c ON o.ID_user = c.ID_user
            WHERE c.FIO_client LIKE ${'%' + fio + '%'}
            ORDER BY o.Date_order DESC`;
        res.json(result.recordset);
    } catch (err) { console.log(err); res.status(500).send("Ошибка сервера"); }
});

// ── Получить профиль пользователя ──
app.get("/profile/:userId", async (req, res) => {
    const { userId } = req.params;
    try {
        const result = await sql.query`
            SELECT ID_user, FIO_client, Email_client, Phone_client, Role_user
            FROM Clients
            WHERE ID_user = ${userId}
        `;
        if (!result.recordset.length) return res.status(404).json({ error: 'Пользователь не найден' });
        res.json(result.recordset[0]);
    } catch (err) { console.log(err); res.status(500).send("Ошибка сервера"); }
});

// ── Обновить профиль пользователя ──
app.put("/profile/:userId", async (req, res) => {
    const { userId } = req.params;
    const { fio, phone } = req.body;
    try {
        await sql.query`
            UPDATE Clients
            SET FIO_client = ${fio}, Phone_client = ${phone}
            WHERE ID_user = ${userId}
        `;
        res.json({ success: true });
    } catch (err) { console.log(err); res.status(500).send("Ошибка сервера"); }
});

// ------------------- ЗАПУСК СЕРВЕРА -------------------

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Server started on port", PORT);
});