"""add_billing_and_subscription_tables

Revision ID: e50f147887bg
Revises: d40e147886af
Create Date: 2026-03-28 20:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'e50f147887bg'
down_revision: Union[str, None] = 'd40e147886af'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── plans ──
    op.create_table('plans',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('slug', sa.String(length=50), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('price_monthly', sa.Numeric(precision=10, scale=2), nullable=False, server_default='0'),
        sa.Column('price_yearly', sa.Numeric(precision=10, scale=2), nullable=False, server_default='0'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('is_public', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name', name='uq_plan_name'),
        sa.UniqueConstraint('slug', name='uq_plan_slug'),
    )
    op.create_index(op.f('ix_plans_slug'), 'plans', ['slug'], unique=True)

    # ── features ──
    op.create_table('features',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('key', sa.String(length=100), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('feature_type', sa.String(length=20), nullable=False, server_default='boolean'),
        sa.Column('default_value', sa.String(length=100), nullable=False, server_default='false'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('key', name='uq_feature_key'),
    )
    op.create_index(op.f('ix_features_key'), 'features', ['key'], unique=True)

    # ── plan_features ──
    op.create_table('plan_features',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('plan_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('feature_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('value', sa.String(length=100), nullable=False, server_default='true'),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['plan_id'], ['plans.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['feature_id'], ['features.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('plan_id', 'feature_id', name='uq_plan_feature'),
    )
    op.create_index(op.f('ix_plan_features_plan_id'), 'plan_features', ['plan_id'], unique=False)
    op.create_index(op.f('ix_plan_features_feature_id'), 'plan_features', ['feature_id'], unique=False)

    # ── subscriptions ──
    op.create_table('subscriptions',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('shop_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('plan_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='active'),
        sa.Column('billing_cycle', sa.String(length=10), nullable=False, server_default='monthly'),
        sa.Column('current_period_start', sa.DateTime(timezone=True), nullable=False),
        sa.Column('current_period_end', sa.DateTime(timezone=True), nullable=False),
        sa.Column('stripe_subscription_id', sa.String(length=255), nullable=True),
        sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['shop_id'], ['shops.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['plan_id'], ['plans.id']),
        sa.UniqueConstraint('shop_id', name='uq_subscription_shop'),
    )
    op.create_index(op.f('ix_subscriptions_shop_id'), 'subscriptions', ['shop_id'], unique=False)
    op.create_index(op.f('ix_subscriptions_plan_id'), 'subscriptions', ['plan_id'], unique=False)
    op.create_index(op.f('ix_subscriptions_status'), 'subscriptions', ['status'], unique=False)

    # ── Seed default plans ──
    # Insert default plans and features using raw SQL
    op.execute("""
        -- Insert features
        INSERT INTO features (id, key, name, description, feature_type, default_value, is_active)
        VALUES
            (gen_random_uuid(), 'ticket_limit', 'Ticket Limit', 'Maximum active tickets at a time', 'numeric', '25', true),
            (gen_random_uuid(), 'team_limit', 'Team Members', 'Maximum team members including owner', 'numeric', '2', true),
            (gen_random_uuid(), 'inventory_limit', 'Inventory Items', 'Maximum inventory items', 'numeric', '100', true),
            (gen_random_uuid(), 'customer_limit', 'Customers', 'Maximum customers', 'numeric', '200', true),
            (gen_random_uuid(), 'analytics_access', 'Analytics Dashboard', 'Access to shop analytics', 'boolean', 'true', true),
            (gen_random_uuid(), 'reports_access', 'Reports', 'Access to detailed reports', 'boolean', 'false', true),
            (gen_random_uuid(), 'api_access', 'API Access', 'REST API access', 'boolean', 'false', true),
            (gen_random_uuid(), 'custom_branding', 'Custom Branding', 'Custom logo and colors', 'boolean', 'false', true),
            (gen_random_uuid(), 'priority_support', 'Priority Support', 'Priority customer support', 'boolean', 'false', true),
            (gen_random_uuid(), 'image_storage_mb', 'Image Storage', 'Storage for ticket images in MB', 'numeric', '500', true)
        ON CONFLICT (key) DO NOTHING;
    """)


def downgrade() -> None:
    op.drop_index(op.f('ix_subscriptions_status'), table_name='subscriptions')
    op.drop_index(op.f('ix_subscriptions_plan_id'), table_name='subscriptions')
    op.drop_index(op.f('ix_subscriptions_shop_id'), table_name='subscriptions')
    op.drop_table('subscriptions')

    op.drop_index(op.f('ix_plan_features_feature_id'), table_name='plan_features')
    op.drop_index(op.f('ix_plan_features_plan_id'), table_name='plan_features')
    op.drop_table('plan_features')

    op.drop_index(op.f('ix_features_key'), table_name='features')
    op.drop_table('features')

    op.drop_index(op.f('ix_plans_slug'), table_name='plans')
    op.drop_table('plans')
