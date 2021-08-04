create table products
(
	id serial not null,
	site text not null,
	image text,
	url text,
	name text,
	description text,
	sku text not null
);

create unique index products_id_uindex
	on products (id);


create table webhooks
(
	id serial not null,
	site text not null,
	webhook_id text not null,
	webhook_token text not null,
	note text
);

create unique index webhooks_id_uindex
	on webhooks (id);

create unique index webhooks_webhook_id_uindex
	on webhooks (webhook_id);

alter table webhooks
	add constraint webhooks_pk
		primary key (id);

