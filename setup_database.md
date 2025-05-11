# Setting Up the Card Checker Database

Follow these steps to set up the database for the card checker application:

## 1. Create the Database Table in Supabase

1. Log in to your Supabase account and open your project
2. Go to the SQL Editor in the left sidebar
3. Create a new query
4. Copy and paste the contents of the `create_card_checks_table.sql` file
5. Run the query

## 2. Verify the Table Creation

1. Go to the Table Editor in the left sidebar
2. You should see the `card_checks` table in the list of tables
3. Click on the table to view its structure
4. Verify that it has the following columns:
   - `id` (UUID, primary key)
   - `user_id` (UUID, references auth.users)
   - `card_data` (TEXT)
   - `status` (TEXT)
   - `response` (TEXT)
   - `amount` (TEXT)
   - `checked_at` (TIMESTAMP WITH TIME ZONE)
   - `created_at` (TIMESTAMP WITH TIME ZONE)

### Note on Running the Script Multiple Times

The SQL script is designed to be idempotent, meaning it can be run multiple times without causing errors:

- It uses `IF NOT EXISTS` for creating tables and indexes
- It drops views before recreating them
- It drops policies before recreating them

If you see any errors when running the script, they are likely due to:
1. Insufficient permissions in your Supabase project
2. Conflicts with existing objects that have different definitions
3. Syntax differences between PostgreSQL versions

## 3. Update Environment Variables

Make sure your application has the correct Supabase credentials:

1. Create or update the `.env` file in the root directory of your project
2. Add the following variables:
   ```
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_KEY=your-service-role-key
   ```
3. Replace `your-project-id`, `your-anon-key`, and `your-service-role-key` with your actual Supabase project values
   - The service role key can be found in your Supabase project settings under "API" > "Project API keys" > "service_role key (secret)"
   - **Important**: Keep your service role key secret and never expose it to the client-side code

## 4. Test the Database Connection

1. Start the server:
   ```
   node server.cjs
   ```
2. Check the console for any database connection errors
3. If there are no errors, the database connection is working correctly

## 5. Test Card Checking

1. Log in to the application
2. Go to the card checker page
3. Enter a test card and check it
4. Go to the stats page to see if the card check was recorded

## Database Schema Explanation

### card_checks Table

This table stores the results of card checks:

- `id`: A unique identifier for each card check
- `user_id`: The ID of the user who performed the check
- `card_data`: The card data that was checked
- `status`: The result of the check (charged, 3ds_challenge, or declined)
- `response`: The response message from the card checking service
- `amount`: The amount that was charged (if applicable)
- `checked_at`: The time when the card was checked
- `created_at`: The time when the record was created

### Views

The SQL script creates several views to make querying the data easier:

- `user_card_stats`: Shows the count of cards by status for each user
- `global_card_stats`: Shows the count of cards by status across all users
- `top_users`: Shows the top 10 users with the most charged cards

All views are created with `SECURITY INVOKER` to ensure they run with the permissions of the querying user rather than the view creator. This means that the Row Level Security policies on the card_checks table will be enforced when users query these views.

### Row Level Security

The table has Row Level Security enabled to ensure that users can only access their own data:

- Users can only view their own card checks
- Users can only insert their own card checks
- The service role (used by the server) can access all card checks

### Security Considerations

1. **Service Role Key**: The server uses the service role key to bypass Row Level Security when needed. This allows the server to:
   - Record card check results for any user
   - Retrieve statistics across all users
   - This is why the `SUPABASE_SERVICE_KEY` environment variable is required.

2. **View Security**: The views use `SECURITY INVOKER` to ensure they respect Row Level Security policies. If you see warnings about "Security Definer View" in Supabase, you can safely ignore them as we've explicitly set the views to use `SECURITY INVOKER`.

3. **Data Protection**: Sensitive card data is only accessible to the user who performed the check and to the service role. Other users cannot see the actual card numbers, even when viewing statistics.
