from sqladmin import ModelView
from app.modules.users.models import User
from app.modules.shops.models import Shop
from app.modules.customers.models import Customer
from app.modules.tickets.models import Ticket, TicketStatusLog
from app.modules.inventory.models import InventoryItem, TicketPart
from app.modules.invoices.models import Invoice

class UserAdmin(ModelView, model=User):
    column_list = [User.id, User.email, User.full_name, User.role, User.is_active, User.shop_id]
    column_searchable_list = [User.email, User.full_name]
    column_sortable_list = [User.created_at, User.email]

class ShopAdmin(ModelView, model=Shop):
    column_list = [Shop.id, Shop.name, Shop.plan, Shop.is_active]
    column_searchable_list = [Shop.name]

class CustomerAdmin(ModelView, model=Customer):
    column_list = [Customer.id, Customer.name, Customer.phone, Customer.email, Customer.shop_id]
    column_searchable_list = [Customer.name, Customer.phone]

class TicketAdmin(ModelView, model=Ticket):
    column_list = [Ticket.id, Ticket.ticket_number, Ticket.customer_id, Ticket.device_type, Ticket.status, Ticket.estimated_cost, Ticket.shop_id]
    column_searchable_list = [Ticket.ticket_number, Ticket.device_type]
    column_labels = {"id": "UUID", "ticket_number": "Ticket ID"}
    column_formatters = {
        Ticket.ticket_number: lambda m, a: f"TCKT-{str(m.ticket_number).zfill(3)}" if m.ticket_number else ""
    }

class TicketStatusLogAdmin(ModelView, model=TicketStatusLog):
    column_list = [TicketStatusLog.id, TicketStatusLog.ticket_id, TicketStatusLog.from_status, TicketStatusLog.to_status, TicketStatusLog.changed_at]

class InventoryItemAdmin(ModelView, model=InventoryItem):
    column_list = [InventoryItem.id, InventoryItem.name, InventoryItem.sku, InventoryItem.quantity, InventoryItem.shop_id]
    column_searchable_list = [InventoryItem.name, InventoryItem.sku]

class TicketPartAdmin(ModelView, model=TicketPart):
    column_list = [TicketPart.id, TicketPart.ticket_id, TicketPart.inventory_item_id, TicketPart.quantity_used]

class InvoiceAdmin(ModelView, model=Invoice):
    column_list = [Invoice.id, Invoice.invoice_number, Invoice.total_amount, Invoice.generated_at, Invoice.shop_id]
    column_searchable_list = [Invoice.invoice_number]

__all__ = [
    "UserAdmin",
    "ShopAdmin",
    "CustomerAdmin",
    "TicketAdmin",
    "TicketStatusLogAdmin",
    "InventoryItemAdmin",
    "TicketPartAdmin",
    "InvoiceAdmin",
]
