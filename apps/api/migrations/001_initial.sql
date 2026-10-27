CREATE TABLE stores (
 id uuid PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL,
 city text NOT NULL, state text NOT NULL, active boolean NOT NULL DEFAULT true
);
CREATE TABLE roles (id text PRIMARY KEY CHECK(id IN ('admin','manager','operator')), name text NOT NULL);
CREATE TABLE users (
 id uuid PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
 password_hash text NOT NULL, role_id text NOT NULL REFERENCES roles(id),
 store_id uuid REFERENCES stores(id), active boolean NOT NULL DEFAULT true,
 CHECK(role_id = 'admin' OR store_id IS NOT NULL)
);
CREATE INDEX users_store_role_idx ON users(store_id, role_id) WHERE active;
CREATE TABLE templates (
 id uuid PRIMARY KEY, current_version integer NOT NULL, active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE template_versions (
 template_id uuid NOT NULL REFERENCES templates(id), version integer NOT NULL,
 payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(template_id, version)
);
CREATE TABLE executions (
 id uuid PRIMARY KEY, template_id uuid NOT NULL, template_version integer NOT NULL,
 store_id uuid NOT NULL REFERENCES stores(id), user_id uuid NOT NULL REFERENCES users(id),
 snapshot jsonb NOT NULL, payload_hash text NOT NULL, score numeric(5,2),
 started_at timestamptz NOT NULL, finished_at timestamptz NOT NULL,
 synced_at timestamptz, received_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(template_id, template_version) REFERENCES template_versions(template_id, version)
);
CREATE INDEX executions_store_finished_idx ON executions(store_id, finished_at DESC);
CREATE TABLE responses (
 id uuid PRIMARY KEY, execution_id uuid NOT NULL REFERENCES executions(id),
 item_id uuid NOT NULL, item_description text NOT NULL,
 value text CHECK(value IN ('C','NC','NA')), observation text NOT NULL DEFAULT '',
 UNIQUE(execution_id, item_id)
);
CREATE INDEX responses_execution_idx ON responses(execution_id);
CREATE TABLE action_plans (
 id uuid PRIMARY KEY, response_id uuid NOT NULL UNIQUE REFERENCES responses(id),
 execution_id uuid NOT NULL REFERENCES executions(id), store_id uuid NOT NULL REFERENCES stores(id),
 description text NOT NULL, responsible_id uuid NOT NULL REFERENCES users(id), due_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','completed')),
 version integer NOT NULL DEFAULT 1, completed_at timestamptz, completion_hash text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX actions_store_status_due_idx ON action_plans(store_id,status,due_at);
CREATE TABLE photos (
 id uuid PRIMARY KEY, response_id uuid REFERENCES responses(id), action_id uuid REFERENCES action_plans(id),
 store_id uuid NOT NULL REFERENCES stores(id), storage_key text NOT NULL UNIQUE,
 content_type text NOT NULL, size_bytes integer NOT NULL CHECK(size_bytes > 0),
 confirmed boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((response_id IS NOT NULL)::integer + (action_id IS NOT NULL)::integer = 1)
);
CREATE INDEX photos_response_idx ON photos(response_id);
CREATE INDEX photos_action_idx ON photos(action_id);
