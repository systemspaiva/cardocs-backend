create table organizations (
    id uuid primary key,
    name varchar(255) not null,
    document varchar(80),
    created_at timestamptz not null,
    updated_at timestamptz not null,
    deleted_at timestamptz
);

create table users (
    id uuid primary key,
    email varchar(255) not null,
    name varchar(255) not null,
    password_hash varchar(255) not null,
    role varchar(40) not null,
    status varchar(40) not null,
    organization_id uuid,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    deleted_at timestamptz
);

create unique index users_email_uq on users (lower(email)) where deleted_at is null;

create table vehicles (
    id uuid primary key,
    user_id uuid not null,
    organization_id uuid,
    plate varchar(20) not null,
    type varchar(40) not null,
    brand varchar(120),
    model varchar(120),
    version varchar(120),
    year integer,
    manufacture_year integer,
    color varchar(80),
    fuel_type varchar(40),
    chassis_last_digits varchar(20),
    renavam_masked varchar(40),
    current_mileage integer,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    deleted_at timestamptz
);

create index vehicles_user_id_idx on vehicles (user_id);
create index vehicles_plate_idx on vehicles (plate);

create table vehicle_documents (
    id uuid primary key,
    vehicle_id uuid not null,
    user_id uuid not null,
    type varchar(60) not null,
    file_name varchar(255) not null,
    content_type varchar(120) not null,
    file_size bigint not null,
    storage_key varchar(1024) not null,
    storage_bucket varchar(255),
    ocr_status varchar(60) not null,
    ocr_raw_text text,
    ocr_structured_data jsonb,
    reviewed_data jsonb,
    review_status varchar(60) not null,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    deleted_at timestamptz
);

create index vehicle_documents_vehicle_id_idx on vehicle_documents (vehicle_id);
create index vehicle_documents_user_id_idx on vehicle_documents (user_id);

create table maintenance_records (
    id uuid primary key,
    vehicle_id uuid not null,
    user_id uuid not null,
    type varchar(60) not null,
    title varchar(255) not null,
    description text,
    service_date date not null,
    mileage integer,
    amount numeric(12,2),
    currency varchar(12),
    vendor_name varchar(255),
    document_id uuid,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    deleted_at timestamptz
);

create index maintenance_records_vehicle_id_idx on maintenance_records (vehicle_id);
create index maintenance_records_user_id_idx on maintenance_records (user_id);

create table reminders (
    id uuid primary key,
    vehicle_id uuid not null,
    user_id uuid not null,
    type varchar(60) not null,
    title varchar(255) not null,
    description text,
    due_date date,
    due_mileage integer,
    current_mileage_snapshot integer,
    status varchar(60) not null,
    notification_enabled boolean not null default true,
    completed_at timestamptz,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    deleted_at timestamptz
);

create index reminders_vehicle_id_idx on reminders (vehicle_id);
create index reminders_user_id_idx on reminders (user_id);
create index reminders_due_date_idx on reminders (due_date);

create table share_links (
    id uuid primary key,
    vehicle_id uuid not null,
    user_id uuid not null,
    token varchar(160) not null,
    status varchar(60) not null,
    expires_at timestamptz,
    allowed_sections jsonb,
    public_title varchar(255),
    revoked_at timestamptz,
    last_accessed_at timestamptz,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    deleted_at timestamptz
);

create unique index share_links_token_uq on share_links (token);
create index share_links_vehicle_id_idx on share_links (vehicle_id);

create table consent_records (
    id uuid primary key,
    user_id uuid not null,
    type varchar(80) not null,
    granted boolean not null,
    granted_at timestamptz,
    revoked_at timestamptz,
    metadata jsonb,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    deleted_at timestamptz
);

create index consent_records_user_id_idx on consent_records (user_id);

create table audit_logs (
    id uuid primary key,
    user_id uuid,
    organization_id uuid,
    entity_type varchar(120),
    entity_id uuid,
    action varchar(80) not null,
    metadata jsonb,
    ip_address varchar(80),
    user_agent varchar(512),
    created_at timestamptz not null,
    updated_at timestamptz not null,
    deleted_at timestamptz
);

create index audit_logs_user_id_idx on audit_logs (user_id);
create index audit_logs_created_at_idx on audit_logs (created_at);

create table pdf_export_requests (
    id uuid primary key,
    user_id uuid not null,
    vehicle_id uuid not null,
    type varchar(60) not null,
    status varchar(60) not null,
    storage_key varchar(1024),
    error_message text,
    completed_at timestamptz,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    deleted_at timestamptz
);

create index pdf_export_requests_user_id_idx on pdf_export_requests (user_id);
create index pdf_export_requests_vehicle_id_idx on pdf_export_requests (vehicle_id);

create table data_export_requests (
    id uuid primary key,
    user_id uuid not null,
    status varchar(60) not null,
    storage_key varchar(1024),
    error_message text,
    completed_at timestamptz,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    deleted_at timestamptz
);

create index data_export_requests_user_id_idx on data_export_requests (user_id);
