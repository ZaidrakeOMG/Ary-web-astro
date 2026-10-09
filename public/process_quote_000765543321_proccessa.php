<?php

	session_start(); 

	session_register("error2");

	if($_POST['nombre']=="" OR $_POST['email']==""){

		$url = "error2.htm";

	}

	else{

		$nombre = "Nombre: ".$_POST['nombre'];

		$apellido = "Apellidos: ".$_POST['apellido'];

		$email = "email: ".$_POST['email'];

		$telefono = "Telefono: ".$_POST['telefono'];

		$comentarios = "Comentarios: ".$_POST['comentarios'];

		//ENVIA CORREO DE CONFIRMACION

		$msg = array($nombre, $apellido, $email, $telefono, $comentarios);

		$header = "From: \"Ary Super Servicios\"<info@grupoary.com.mx>\n";

		mail("creactivo.web@gmail.com", "Solicito Informacion", join("\n", $msg), $header);

		$url = "gracias.htm";

	}

	echo '<meta http-equiv="refresh" content="0;url='.$url.'">';

?>