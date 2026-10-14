--
-- PostgreSQL database dump
--

\restrict FMS2QKAbNGpPIAZivodZ6ZJWBq5vekyci3wmsoqSnmDVvS35GJRP16hr35ezSdi

-- Dumped from database version 15.19 (Debian 15.19-0+deb12u1)
-- Dumped by pg_dump version 15.19 (Debian 15.19-0+deb12u1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alerts (
    id integer NOT NULL,
    type text NOT NULL,
    severity text DEFAULT 'warning'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    explanation text,
    detector text DEFAULT 'rule'::text NOT NULL,
    rule_id text,
    helmet_id integer,
    worker_id integer,
    measured_value real,
    threshold real,
    unit text,
    location text,
    source text DEFAULT 'simulated'::text NOT NULL,
    snapshot jsonb DEFAULT '{}'::jsonb,
    dedupe_key text,
    acknowledged_at timestamp with time zone,
    acknowledged_by integer,
    acknowledgement_note text,
    resolved_at timestamp with time zone,
    resolved_by integer,
    resolution_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: alerts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alerts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: alerts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alerts_id_seq OWNED BY public.alerts.id;


--
-- Name: event_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_logs (
    id integer NOT NULL,
    level text DEFAULT 'info'::text NOT NULL,
    source text DEFAULT 'backend'::text NOT NULL,
    message text NOT NULL,
    meta jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: event_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.event_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: event_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.event_logs_id_seq OWNED BY public.event_logs.id;


--
-- Name: helmets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.helmets (
    id integer NOT NULL,
    code text NOT NULL,
    firmware_version text DEFAULT 'esp32-s3-1.0.0'::text,
    mac_address text,
    gas_sensor_model text DEFAULT 'MQ-135'::text,
    sensors jsonb DEFAULT '{"gas": true, "battery": true, "humidity": true, "pressure": false, "temperature": true, "accelerometer": true}'::jsonb NOT NULL,
    battery_percent real,
    connection_state text DEFAULT 'offline'::text NOT NULL,
    data_source text DEFAULT 'simulated'::text NOT NULL,
    last_heartbeat_at timestamp with time zone,
    last_reading_at timestamp with time zone,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: helmets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.helmets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: helmets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.helmets_id_seq OWNED BY public.helmets.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id integer NOT NULL,
    user_id integer NOT NULL,
    alert_id integer,
    title text NOT NULL,
    body text NOT NULL,
    priority text DEFAULT 'warning'::text NOT NULL,
    channel text DEFAULT 'in_app'::text NOT NULL,
    delivery_status text DEFAULT 'pending'::text NOT NULL,
    delivery_detail text,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: push_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_tokens (
    id integer NOT NULL,
    user_id integer NOT NULL,
    token text NOT NULL,
    platform text DEFAULT 'android'::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: push_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.push_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: push_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.push_tokens_id_seq OWNED BY public.push_tokens.id;


--
-- Name: sensor_readings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sensor_readings (
    id integer NOT NULL,
    helmet_id integer NOT NULL,
    worker_id integer,
    gas_raw real,
    temperature_c real,
    humidity_percent real,
    pressure_hpa real,
    accel_x real,
    accel_y real,
    accel_z real,
    accel_magnitude_g real,
    battery_percent real,
    anomaly_score real,
    anomaly_label text,
    source text DEFAULT 'simulated'::text NOT NULL,
    device_timestamp timestamp with time zone,
    received_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sensor_readings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sensor_readings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sensor_readings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sensor_readings_id_seq OWNED BY public.sensor_readings.id;


--
-- Name: system_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_state (
    key text NOT NULL,
    value jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: threshold_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.threshold_configs (
    id integer NOT NULL,
    scope text DEFAULT 'global'::text NOT NULL,
    gas_warning real DEFAULT 900 NOT NULL,
    gas_critical real DEFAULT 1400 NOT NULL,
    gas_unit text DEFAULT 'MQ-135 raw ADC'::text NOT NULL,
    temperature_warning real DEFAULT 38 NOT NULL,
    temperature_critical real DEFAULT 43 NOT NULL,
    humidity_warning real DEFAULT 85 NOT NULL,
    battery_low real DEFAULT 25 NOT NULL,
    offline_timeout_seconds integer DEFAULT 90 NOT NULL,
    fall_impact_g real DEFAULT 2.6 NOT NULL,
    fall_free_fall_g real DEFAULT 0.45 NOT NULL,
    fall_window_ms integer DEFAULT 1200 NOT NULL,
    anomaly_enabled boolean DEFAULT true NOT NULL,
    anomaly_sensitivity real DEFAULT 3 NOT NULL,
    anomaly_window integer DEFAULT 40 NOT NULL,
    alert_cooldown_seconds integer DEFAULT 120 NOT NULL,
    sound_enabled boolean DEFAULT true NOT NULL,
    vibration_enabled boolean DEFAULT true NOT NULL,
    emergency_contacts jsonb DEFAULT '{"rescueTeam": "", "safetyOfficer": "", "mineControlRoom": "+91-000-000-0000"}'::jsonb NOT NULL,
    notification_prefs jsonb DEFAULT '{"push": true, "inApp": true, "criticalOnly": false}'::jsonb NOT NULL,
    updated_by integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: threshold_configs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.threshold_configs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: threshold_configs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.threshold_configs_id_seq OWNED BY public.threshold_configs.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username text NOT NULL,
    password_hash text NOT NULL,
    role text DEFAULT 'worker'::text NOT NULL,
    full_name text NOT NULL,
    email text,
    phone text,
    worker_code text,
    active boolean DEFAULT true NOT NULL,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: workers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workers (
    id integer NOT NULL,
    code text NOT NULL,
    full_name text NOT NULL,
    department text DEFAULT 'General'::text,
    zone text DEFAULT 'Zone-A'::text,
    phone text,
    helmet_id integer,
    shift text DEFAULT 'Day'::text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workers_id_seq OWNED BY public.workers.id;


--
-- Name: alerts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts ALTER COLUMN id SET DEFAULT nextval('public.alerts_id_seq'::regclass);


--
-- Name: event_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_logs ALTER COLUMN id SET DEFAULT nextval('public.event_logs_id_seq'::regclass);


--
-- Name: helmets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.helmets ALTER COLUMN id SET DEFAULT nextval('public.helmets_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: push_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens ALTER COLUMN id SET DEFAULT nextval('public.push_tokens_id_seq'::regclass);


--
-- Name: sensor_readings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sensor_readings ALTER COLUMN id SET DEFAULT nextval('public.sensor_readings_id_seq'::regclass);


--
-- Name: threshold_configs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.threshold_configs ALTER COLUMN id SET DEFAULT nextval('public.threshold_configs_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: workers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workers ALTER COLUMN id SET DEFAULT nextval('public.workers_id_seq'::regclass);


--
-- Name: alerts alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_pkey PRIMARY KEY (id);


--
-- Name: event_logs event_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_logs
    ADD CONSTRAINT event_logs_pkey PRIMARY KEY (id);


--
-- Name: helmets helmets_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.helmets
    ADD CONSTRAINT helmets_code_unique UNIQUE (code);


--
-- Name: helmets helmets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.helmets
    ADD CONSTRAINT helmets_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: push_tokens push_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_pkey PRIMARY KEY (id);


--
-- Name: push_tokens push_tokens_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_token_unique UNIQUE (token);


--
-- Name: sensor_readings sensor_readings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sensor_readings
    ADD CONSTRAINT sensor_readings_pkey PRIMARY KEY (id);


--
-- Name: system_state system_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_state
    ADD CONSTRAINT system_state_pkey PRIMARY KEY (key);


--
-- Name: threshold_configs threshold_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.threshold_configs
    ADD CONSTRAINT threshold_configs_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);


--
-- Name: workers workers_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workers
    ADD CONSTRAINT workers_code_unique UNIQUE (code);


--
-- Name: workers workers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workers
    ADD CONSTRAINT workers_pkey PRIMARY KEY (id);


--
-- Name: alerts_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX alerts_created_idx ON public.alerts USING btree (created_at);


--
-- Name: alerts_dedupe_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX alerts_dedupe_idx ON public.alerts USING btree (dedupe_key);


--
-- Name: alerts_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX alerts_status_idx ON public.alerts USING btree (status);


--
-- Name: event_logs_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_logs_created_idx ON public.event_logs USING btree (created_at);


--
-- Name: notifications_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_idx ON public.notifications USING btree (user_id, created_at);


--
-- Name: readings_helmet_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX readings_helmet_time_idx ON public.sensor_readings USING btree (helmet_id, received_at);


--
-- Name: readings_received_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX readings_received_idx ON public.sensor_readings USING btree (received_at);


--
-- Name: workers_helmet_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workers_helmet_idx ON public.workers USING btree (helmet_id);


--
-- Name: alerts alerts_acknowledged_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_acknowledged_by_users_id_fk FOREIGN KEY (acknowledged_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: alerts alerts_helmet_id_helmets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_helmet_id_helmets_id_fk FOREIGN KEY (helmet_id) REFERENCES public.helmets(id) ON DELETE SET NULL;


--
-- Name: alerts alerts_resolved_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_resolved_by_users_id_fk FOREIGN KEY (resolved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: alerts alerts_worker_id_workers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_worker_id_workers_id_fk FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_alert_id_alerts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_alert_id_alerts_id_fk FOREIGN KEY (alert_id) REFERENCES public.alerts(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: push_tokens push_tokens_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: sensor_readings sensor_readings_helmet_id_helmets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sensor_readings
    ADD CONSTRAINT sensor_readings_helmet_id_helmets_id_fk FOREIGN KEY (helmet_id) REFERENCES public.helmets(id) ON DELETE CASCADE;


--
-- Name: sensor_readings sensor_readings_worker_id_workers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sensor_readings
    ADD CONSTRAINT sensor_readings_worker_id_workers_id_fk FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE SET NULL;


--
-- Name: threshold_configs threshold_configs_updated_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.threshold_configs
    ADD CONSTRAINT threshold_configs_updated_by_users_id_fk FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: workers workers_helmet_id_helmets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workers
    ADD CONSTRAINT workers_helmet_id_helmets_id_fk FOREIGN KEY (helmet_id) REFERENCES public.helmets(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict FMS2QKAbNGpPIAZivodZ6ZJWBq5vekyci3wmsoqSnmDVvS35GJRP16hr35ezSdi

