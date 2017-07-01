"""empty message

Revision ID: 6f6b4b3a368d
Revises: abf206ef23a1
Create Date: 2016-11-10 21:07:24.369390

"""

# revision identifiers, used by Alembic.
revision = '6f6b4b3a368d'
down_revision = 'abf206ef23a1'

from alembic import op
import sqlalchemy as sa
import sqlalchemy_utils


def upgrade():
    ### commands auto generated by Alembic - please adjust! ###
    op.add_column('settings', sa.Column('app_name', sa.String(), nullable=True))
    ### end Alembic commands ###


def downgrade():
    ### commands auto generated by Alembic - please adjust! ###
    op.drop_column('settings', 'app_name')
    ### end Alembic commands ###