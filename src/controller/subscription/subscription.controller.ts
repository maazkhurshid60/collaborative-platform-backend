import { stripe, STRIPE_PRICES } from "../../utils/stripe/stripe";
import prisma from "../../db/db.config";

export const startTrialOnApprove = async (userId: string) => {
    const user = await prisma.user.findUnique({
        where: {
            id: userId,

        },
        include: {
            subscription: true,

            provider: {

                select: {
                    email: true,
                    user: {
                        select: {
                            id: true,
                            role: true,
                            fullName: true,
                            subscription: true,

                        }
                    }
                }
            }
        }
    })

    const email = user?.provider?.email;

    // // 1. Create Stripe Customer if not exists
    // let stripeCustomerId = user?.subscription?.stripeSubscriptionId;
    // if (!stripeCustomerId) {
    //     const customer = await stripe.customers.create({
    //         email,
    //         name: user?.provider?.user.fullName,
    //         metadata: {
    //             userId: user?.id
    //         }
    //     });
    //     stripeCustomerId = customer.id;
    // }

    // //2. Create a stripe subscription with 14-day trail 
    // const stripeSubscription = await stripe.subscriptions.create({
    //     customer: stripeCustomerId,
    //     items: [
    //         {
    //             price: STRIPE_PRICES.STANDARD.MONTHLY,
    //         },
    //     ],
    //     trial_period_days: 14,
    //     metadata: {
    //         userId: user?.id,
    //     }
    // });

    //3. update DB for trailing
    // await prisma.subscription.update({
    //     where: { userId: user?.id },
    //     data: {
    //         stripeCustomerId: stripeCustomerId,
    //         stripeSubscriptionId: stripeSubscription.id,
    //         status: "TRIALING",
    //         trailStart: new Date(),
    //         // trailEnd: new Date(stripeSubscription.current_period_end * 1000),
    //         // currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000)
    //     }
    // })

    // 4. update user status to approved
    await prisma.user.update({
        where: {
            id: user?.id,
        },
        data: {
            isApprove: "approved",
        }
    })
}

export const createStripeCustomer = async (userId: string) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                provider: {
                    select: {
                        email: true,
                        user: {
                            select: {

                            }
                        }
                    }
                }
            }
        })
    } catch (error) {

    }
}