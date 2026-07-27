import express from 'express';
import {
  clerkClient,
  clerkMiddleware,
  getAuth,
} from '@clerk/express';
import { supabase } from '../config/supabaseClient.js';

const router = express.Router();

/*
  Clerk checks the Authorization header and attaches
  authentication information to every request.
*/
router.use(clerkMiddleware());

const sqlValue = (value) => {
  if (value === null || value === undefined || value === '') {
    return 'NULL';
  }

  return `'${String(value).replace(/'/g, "''")}'`;
};

const sqlBoolean = (value) => {
  return value ? 'true' : 'false';
};

/*
  Protects a route and adds the trusted Clerk user
  to req.authenticatedUser.
*/
const requireAuthenticatedUser = async (req, res, next) => {
  try {
    const { isAuthenticated, userId } = getAuth(req);

    if (!isAuthenticated || !userId) {
      return res.status(401).json({
        message: 'You must be signed in to perform this action.',
      });
    }

    const clerkUser = await clerkClient.users.getUser(userId);

    const primaryEmail =
      clerkUser.emailAddresses.find(
        (email) => email.id === clerkUser.primaryEmailAddressId
      )?.emailAddress ||
      clerkUser.emailAddresses[0]?.emailAddress;

    if (!primaryEmail) {
      return res.status(400).json({
        message: 'Your Clerk account has no email address.',
      });
    }

    const fullName = [
      clerkUser.firstName,
      clerkUser.lastName,
    ]
      .filter(Boolean)
      .join(' ')
      .trim();

    req.authenticatedUser = {
      userId,
      email: primaryEmail,
      name:
        fullName ||
        clerkUser.username ||
        primaryEmail.split('@')[0] ||
        'Anonymous',
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);

    return res.status(500).json({
      message: 'Authentication failed.',
    });
  }
};

/*
  GET ALL EVENTS
  Public route
*/
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('execute_sql', {
      query_text: `
        SELECT
          *,
          "date" AS last_date
        FROM events
        ORDER BY created_at ASC
      `,
    });

    if (error) {
      return res.status(400).json({
        message: error.message,
      });
    }

    return res.json(data || []);
  } catch (err) {
    console.error('Server error while loading events:', err);

    return res.status(500).json({
      message: 'Server error while loading events.',
    });
  }
});

/*
  CREATE EVENT
  Protected route
*/
router.post(
  '/create',
  requireAuthenticatedUser,
  async (req, res) => {
    try {
      const authenticatedUser = req.authenticatedUser;

      const {
        title,
        description,
        img,
        website,
        isImportant,
        last_date,
        location,
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
          ${
            last_date
              ? `${sqlValue(last_date)}::timestamp`
              : 'NULL'
          },
          ${sqlValue(location)},
          ${sqlValue(authenticatedUser.name)},
          ${sqlValue(authenticatedUser.email)}
        )
        RETURNING *, "date" AS last_date
      `;

      const { data, error } = await supabase.rpc(
        'execute_sql',
        {
          query_text: query,
        }
      );

      if (error) {
        console.error(
          'RPC error while creating event:',
          error.message
        );

        return res.status(400).json({
          message: error.message,
        });
      }

      const createdEvent =
        data && data.length > 0
          ? data[0]
          : { message: 'Event created successfully.' };

      return res.status(201).json(createdEvent);
    } catch (err) {
      console.error(
        'Server error while creating event:',
        err
      );

      return res.status(500).json({
        message: 'Server error while creating event.',
      });
    }
  }
);

/*
  GET ONE EVENT
  Public route
*/
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
      query_text: query,
    });

    if (error) {
      return res.status(400).json({
        message: error.message,
      });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({
        message: 'Event not found.',
      });
    }

    return res.json(data[0]);
  } catch (err) {
    console.error('Server error while loading event:', err);

    return res.status(500).json({
      message: 'Server error while loading event.',
    });
  }
});

/*
  UPDATE EVENT
  Protected route
*/
router.put(
  '/update/:id',
  requireAuthenticatedUser,
  async (req, res) => {
    try {
      const authenticatedUser = req.authenticatedUser;
      const { id } = req.params;

      const {
        title,
        description,
        img,
        website,
        isImportant,
        last_date,
        location,
      } = req.body;

      const query = `
        UPDATE events
        SET
          "title" = ${sqlValue(title)},
          "description" = ${sqlValue(description)},
          "img" = ${sqlValue(img)},
          "website" = ${sqlValue(website)},
          "isImportant" = ${sqlBoolean(isImportant)},
          "date" = ${
            last_date
              ? `${sqlValue(last_date)}::timestamp`
              : 'NULL'
          },
          "location" = ${sqlValue(location)},
          "author" = ${sqlValue(authenticatedUser.name)}
        WHERE id = ${sqlValue(id)}
        AND "user_email" = ${sqlValue(
          authenticatedUser.email
        )}
        RETURNING *, "date" AS last_date
      `;

      const { data, error } = await supabase.rpc(
        'execute_sql',
        {
          query_text: query,
        }
      );

      if (error) {
        console.error(
          'RPC error while updating event:',
          error.message
        );

        return res.status(400).json({
          message: error.message,
        });
      }

      if (!data || data.length === 0) {
        return res.status(403).json({
          message:
            'Event not found or you are not allowed to update it.',
        });
      }

      return res.json({
        message: 'Event updated successfully.',
        updatedEvent: data[0],
      });
    } catch (err) {
      console.error(
        'Server error while updating event:',
        err
      );

      return res.status(500).json({
        message: 'Server error while updating event.',
      });
    }
  }
);

/*
  DELETE EVENT
  Protected route
*/
router.delete(
  '/delete/:id',
  requireAuthenticatedUser,
  async (req, res) => {
    try {
      const authenticatedUser = req.authenticatedUser;
      const { id } = req.params;

      const query = `
        DELETE FROM events
        WHERE id = ${sqlValue(id)}
        AND "user_email" = ${sqlValue(
          authenticatedUser.email
        )}
        RETURNING *, "date" AS last_date
      `;

      const { data, error } = await supabase.rpc(
        'execute_sql',
        {
          query_text: query,
        }
      );

      if (error) {
        console.error(
          'RPC error while deleting event:',
          error.message
        );

        return res.status(400).json({
          message: error.message,
        });
      }

      if (!data || data.length === 0) {
        return res.status(403).json({
          message:
            'Event not found or you are not allowed to delete it.',
        });
      }

      return res.json({
        message: 'Event deleted successfully.',
        deletedEvent: data[0],
      });
    } catch (err) {
      console.error(
        'Server error while deleting event:',
        err
      );

      return res.status(500).json({
        message: 'Server error while deleting event.',
      });
    }
  }
);

export default router;