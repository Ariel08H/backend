import express from 'express';
import { supabase } from '../config/supabaseClient.js';

const router = express.Router();

const sqlValue = (value) => {
    if (value === null || value === undefined || value === '') {
        return 'NULL';
    }

    return `'${String(value).replace(/'/g, "''")}'`;
};

const sqlBoolean = (value) => {
    return value ? 'true' : 'false';
};

router.get('/', async (req, res) => {
    const { data, error } = await supabase
        .rpc('execute_sql', {
            query_text: `
                SELECT 
                    *,
                    "date" AS last_date
                FROM events
                ORDER BY created_at ASC
            `
        });

    if (error) return res.status(400).json({ error: error.message });

    res.json(data);
});

// create
router.post('/create', async (req, res) => {
    try {
        const {
            title,
            description,
            img,
            website,
            isImportant,
            last_date,
            location,
            author,
            user_email
        } = req.body;

        const query = `
            INSERT INTO events (
                "title",
                "description",
                "img",
                "website",
                "isImportant",
                "date",
                "location",
                "author",
                "user_email"
            )
            VALUES (
                ${sqlValue(title)},
                ${sqlValue(description)},
                ${sqlValue(img)},
                ${sqlValue(website)},
                ${sqlBoolean(isImportant)},
                ${last_date ? `${sqlValue(last_date)}::timestamp` : 'NULL'},
                ${sqlValue(location)},
                ${sqlValue(author)},
                ${sqlValue(user_email)}
            )
            RETURNING *, "date" AS last_date
        `;

        console.log("🏃 Running create query in Supabase...");

        const { data, error } = await supabase.rpc('execute_sql', {
            query_text: query
        });

        if (error) {
            console.error("🔴 RPC Error:", error.message);
            return res.status(400).json({ error: error.message });
        }

        const responseData =
            data && data.length > 0
                ? data[0]
                : { message: "Success but no data returned" };

        res.json(responseData);

    } catch (err) {
        console.error("🔥 Server error:", err.message);
        res.status(500).json({
            error: "Server crashed",
            details: err.message
        });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const query = `
            SELECT 
                *,
                "date" AS last_date
            FROM events
            WHERE id = ${sqlValue(id)}
            LIMIT 1
        `;

        const { data, error } = await supabase.rpc('execute_sql', {
            query_text: query
        });

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        if (!data || data.length === 0) {
            return res.status(404).json({ message: 'Event not found' });
        }

        res.json(data[0]);

    } catch (err) {
        console.error("🔥 Server error while loading event:", err.message);
        res.status(500).json({
            error: "Server crashed",
            details: err.message
        });
    }
});

// update
router.put('/update/:id', async (req, res) => {
    console.log("✏️ Got update request for event ID:", req.params.id);

    try {
        const { id } = req.params;

        const {
            title,
            description,
            img,
            website,
            isImportant,
            last_date,
            location,
            author,
            user_email
        } = req.body;

        const query = `
            UPDATE events
            SET
                "title" = ${sqlValue(title)},
                "description" = ${sqlValue(description)},
                "img" = ${sqlValue(img)},
                "website" = ${sqlValue(website)},
                "isImportant" = ${sqlBoolean(isImportant)},
                "date" = ${last_date ? `${sqlValue(last_date)}::timestamp` : 'NULL'},
                "location" = ${sqlValue(location)},
                "author" = ${sqlValue(author)}
            WHERE id = ${sqlValue(id)}
            AND "user_email" = ${sqlValue(user_email)}
            RETURNING *, "date" AS last_date
        `;

        const { data, error } = await supabase.rpc('execute_sql', {
            query_text: query
        });

        if (error) {
            console.error("🔴 RPC Error while updating event:", error.message);
            return res.status(400).json({ message: error.message });
        }

        if (!data || data.length === 0) {
            return res.status(404).json({
                message: "Event not found"
            });
        }

        res.json({
            message: "Event updated successfully",
            updatedEvent: data[0]
        });

    } catch (err) {
        console.error("🔥 Server error while updating event:", err.message);
        res.status(500).json({
            message: "Server crashed while updating event",
            details: err.message
        });
    }
});

// delete
router.delete('/delete/:id', async (req, res) => {
    console.log("🗑️ Got delete request for event ID:", req.params.id);

    try {
        const { id } = req.params;
        const { user_email } = req.body;

        const query = `
            DELETE FROM events
            WHERE id = ${sqlValue(id)}
            AND "user_email" = ${sqlValue(user_email)}
            RETURNING *, "date" AS last_date
        `;

        const { data, error } = await supabase.rpc('execute_sql', {
            query_text: query
        });

        if (error) {
            console.error("🔴 RPC Error while deleting event:", error.message);
            return res.status(400).json({ message: error.message });
        }

        if (!data || data.length === 0) {
            return res.status(403).json({
                message: "You are not allowed to delete this event"
            });
        }

        res.json({
            message: "Event deleted successfully",
            deletedEvent: data[0]
        });

    } catch (err) {
        console.error("🔥 Server error while deleting event:", err.message);
        res.status(500).json({
            message: "Server crashed while deleting event",
            details: err.message
        });
    }
});

export default router;