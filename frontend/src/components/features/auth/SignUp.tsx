import { Link } from "react-router"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FormInput } from "../../../components/form/FormInput"
import { signUpSchema, type SignUpFormData } from "@/schemas/auth"
import { useSignUp } from "@/hooks/useAuth"
import { getApiError } from "@/lib/axios"

const SignUp = ({ className, ...props }: React.ComponentProps<"div">) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
  })

  const signUp = useSignUp()

  const onSubmit = (data: SignUpFormData) => {
    signUp.mutate(data)
  }

  const apiError = signUp.isError ? getApiError(signUp.error) : null

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Create your account</CardTitle>
          <CardDescription>Enter your details below to get started</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormInput
              label="Full Name"
              type="text"
              placeholder="John Doe"
              autoComplete="name"
              error={errors.full_name?.message}
              {...register("full_name")}
            />

            <FormInput
              label="Email"
              type="email"
              placeholder="m@example.com"
              autoComplete="email"
              error={errors.email?.message}
              {...register("email")}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormInput
                label="Password"
                type="password"
                autoComplete="new-password"
                error={errors.password?.message}
                {...register("password")}
              />
              <FormInput
                label="Confirm Password"
                type="password"
                autoComplete="new-password"
                error={errors.confirm_password?.message}
                {...register("confirm_password")}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Must be at least 8 characters, include one uppercase letter and one number.
            </p>

            {apiError && (
              <p className="text-sm text-destructive text-center">{apiError}</p>
            )}

            <Button type="submit" disabled={signUp.isPending} className="w-full">
              {signUp.isPending ? "Creating account..." : "Create Account"}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to="/sign-in" className="underline underline-offset-4 hover:text-primary">
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default SignUp